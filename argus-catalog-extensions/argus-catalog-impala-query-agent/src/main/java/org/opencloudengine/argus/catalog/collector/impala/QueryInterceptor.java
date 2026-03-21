package org.opencloudengine.argus.catalog.collector.impala;

import java.lang.reflect.Method;

/**
 * Static interceptor methods called from ASM-instrumented Impala Frontend code.
 *
 * <p>These methods are invoked by the bytecode injected into
 * {@code Frontend.createExecRequest()}. They use reflection to access
 * Impala's Thrift objects to avoid compile-time dependency on Impala JARs.</p>
 *
 * <h3>Version compatibility</h3>
 * <ul>
 *   <li><b>Impala 3.x</b>: First argument is {@code TQueryCtx} directly</li>
 *   <li><b>Impala 4.0+</b>: First argument is {@code PlanCtx}, which wraps
 *       {@code TQueryCtx} accessible via {@code getQueryContext()}</li>
 * </ul>
 * <p>The interceptor auto-detects the argument type at runtime via reflection.</p>
 *
 * <h3>Extracted fields</h3>
 * <ul>
 *   <li>{@code timestamp} — Query start time (epoch millis)</li>
 *   <li>{@code query} — SQL query text ({@code TQueryCtx.client_request.stmt})</li>
 *   <li>{@code plan} — Query execution plan ({@code TExecRequest.query_exec_request.query_plan})</li>
 *   <li>{@code user} — Connected user ({@code TQueryCtx.session.connected_user})</li>
 *   <li>{@code delegateUser} — Delegated user ({@code TQueryCtx.session.delegated_user})</li>
 * </ul>
 */
public class QueryInterceptor {

    private static final String LOG_PREFIX = "[ImpalaQueryAgent] ";

    /**
     * PlanCtx class name (Impala 4.x). Used to detect version at runtime.
     */
    private static final String PLAN_CTX_CLASS = "org.apache.impala.planner.PlanCtx";

    /**
     * Thread-local to store query start time.
     */
    private static final ThreadLocal<Long> QUERY_START_TIME = new ThreadLocal<>();

    /**
     * Called at entry of {@code Frontend.createExecRequest(...)}.
     *
     * @param firstArg TQueryCtx (3.x) or PlanCtx (4.x)
     */
    public static void onQueryStart(Object firstArg) {
        QUERY_START_TIME.set(System.currentTimeMillis());
    }

    /**
     * Called at exit of {@code Frontend.createExecRequest(...)}.
     *
     * @param execRequestObj TExecRequest return value
     * @param firstArg       TQueryCtx (3.x) or PlanCtx (4.x)
     */
    public static void onQueryComplete(Object execRequestObj, Object firstArg) {
        try {
            long timestamp = QUERY_START_TIME.get() != null ? QUERY_START_TIME.get() : System.currentTimeMillis();
            QUERY_START_TIME.remove();

            // Resolve TQueryCtx from firstArg (handles both 3.x and 4.x)
            Object queryCtx = resolveQueryCtx(firstArg);
            if (queryCtx == null) {
                System.err.println(LOG_PREFIX + "Could not resolve TQueryCtx from " + firstArg.getClass().getName());
                return;
            }

            String query = extractQuery(queryCtx);
            String user = extractUser(queryCtx);
            String delegateUser = extractDelegateUser(queryCtx);
            String plan = extractPlan(execRequestObj);

            QuerySender.send(timestamp, query, plan, user, delegateUser);

        } catch (Exception e) {
            // Agent must never crash the host process
            System.err.println(LOG_PREFIX + "Error capturing query event: " + e.getMessage());
        }
    }

    /**
     * Resolve TQueryCtx from the first argument.
     *
     * <ul>
     *   <li>Impala 3.x: firstArg IS TQueryCtx → return as-is</li>
     *   <li>Impala 4.x: firstArg is PlanCtx → call getQueryContext() to unwrap</li>
     * </ul>
     */
    private static Object resolveQueryCtx(Object firstArg) {
        if (firstArg == null) return null;

        String className = firstArg.getClass().getName();

        // Impala 4.x: PlanCtx wraps TQueryCtx
        if (PLAN_CTX_CLASS.equals(className)) {
            Object queryCtx = invoke(firstArg, "getQueryContext");
            if (queryCtx != null) return queryCtx;

            // Fallback: try field access (protected field queryCtx_)
            return tryFieldAccess(firstArg, "queryCtx_");
        }

        // Impala 3.x: firstArg is already TQueryCtx (or unknown type)
        // Verify by checking for client_request getter
        if (invoke(firstArg, "getClient_request") != null
                || hasField(firstArg, "client_request")) {
            return firstArg;
        }

        // Unknown type — try PlanCtx-style unwrap as last resort
        Object queryCtx = invoke(firstArg, "getQueryContext");
        if (queryCtx != null) return queryCtx;

        return firstArg;
    }

    /**
     * Extract query text from TQueryCtx.
     * Path: TQueryCtx.client_request.stmt
     */
    private static String extractQuery(Object queryCtx) {
        try {
            Object clientRequest = invoke(queryCtx, "getClient_request");
            if (clientRequest == null) {
                clientRequest = tryFieldGet(queryCtx, "client_request");
            }
            if (clientRequest == null) return null;

            Object stmt = invoke(clientRequest, "getStmt");
            if (stmt == null) {
                stmt = tryFieldGet(clientRequest, "stmt");
            }
            return stmt != null ? stmt.toString() : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Extract connected user from TQueryCtx.
     * Path: TQueryCtx.session.connected_user
     */
    private static String extractUser(Object queryCtx) {
        try {
            Object session = invoke(queryCtx, "getSession");
            if (session == null) {
                session = tryFieldGet(queryCtx, "session");
            }
            if (session == null) return null;

            Object user = invoke(session, "getConnected_user");
            if (user == null) {
                user = tryFieldGet(session, "connected_user");
            }
            return user != null ? user.toString() : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Extract delegate user from TQueryCtx.
     * Path: TQueryCtx.session.delegated_user
     */
    private static String extractDelegateUser(Object queryCtx) {
        try {
            Object session = invoke(queryCtx, "getSession");
            if (session == null) {
                session = tryFieldGet(queryCtx, "session");
            }
            if (session == null) return null;

            Object delegatedUser = invoke(session, "getDelegated_user");
            if (delegatedUser == null) {
                delegatedUser = tryFieldGet(session, "delegated_user");
            }
            return delegatedUser != null ? delegatedUser.toString() : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Extract query plan from TExecRequest.
     * Path: TExecRequest.query_exec_request.query_plan
     */
    private static String extractPlan(Object execRequest) {
        try {
            // Primary: TExecRequest.getQuery_exec_request().getQuery_plan()
            Object queryExecRequest = invoke(execRequest, "getQuery_exec_request");
            if (queryExecRequest != null) {
                Object plan = invoke(queryExecRequest, "getQuery_plan");
                if (plan != null) return plan.toString();
            }

            // Fallback: TExecRequest.getQuery_plan() (some versions)
            Object plan = invoke(execRequest, "getQuery_plan");
            if (plan != null) return plan.toString();

            return null;
        } catch (Exception e) {
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Reflection utilities
    // -------------------------------------------------------------------------

    private static Object invoke(Object target, String methodName) {
        if (target == null) return null;
        try {
            Method method = target.getClass().getMethod(methodName);
            return method.invoke(target);
        } catch (NoSuchMethodException e) {
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private static Object tryFieldGet(Object target, String fieldName) {
        if (target == null) return null;
        try {
            java.lang.reflect.Field f = target.getClass().getField(fieldName);
            f.setAccessible(true);
            return f.get(target);
        } catch (Exception e) {
            // Try declared field (for protected/private fields)
            try {
                java.lang.reflect.Field f = target.getClass().getDeclaredField(fieldName);
                f.setAccessible(true);
                return f.get(target);
            } catch (Exception e2) {
                return null;
            }
        }
    }

    private static String tryFieldAccess(Object root, String fieldName) {
        Object val = tryFieldGet(root, fieldName);
        return val != null ? val.toString() : null;
    }

    private static boolean hasField(Object target, String fieldName) {
        try {
            target.getClass().getField(fieldName);
            return true;
        } catch (NoSuchFieldException e) {
            return false;
        }
    }
}
