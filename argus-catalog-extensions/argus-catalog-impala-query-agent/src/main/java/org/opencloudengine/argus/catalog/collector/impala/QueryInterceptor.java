package org.opencloudengine.argus.catalog.collector.impala;

import java.lang.reflect.Method;

/**
 * Static interceptor methods called from ASM-instrumented Impala Frontend code.
 *
 * <p>These methods are invoked by the bytecode injected into
 * {@code Frontend.createExecRequest()}. They use reflection to access
 * Impala's Thrift objects (TQueryCtx, TExecRequest) to avoid compile-time
 * dependency on Impala JARs.</p>
 *
 * <p>Extracted fields:</p>
 * <ul>
 *   <li>{@code timestamp} — Query start time (epoch millis)</li>
 *   <li>{@code query} — SQL query text</li>
 *   <li>{@code plan} — Query execution plan (from TExecRequest)</li>
 *   <li>{@code user} — Connected user (effective user)</li>
 *   <li>{@code delegateUser} — Delegated user (if proxy user is used)</li>
 * </ul>
 */
public class QueryInterceptor {

    private static final String LOG_PREFIX = "[ImpalaQueryAgent] ";

    /**
     * Thread-local to store query start time.
     */
    private static final ThreadLocal<Long> QUERY_START_TIME = new ThreadLocal<>();

    /**
     * Called at entry of {@code Frontend.createExecRequest(TQueryCtx, ...)}.
     *
     * @param queryCtxObj TQueryCtx Thrift object (accessed via reflection)
     */
    public static void onQueryStart(Object queryCtxObj) {
        QUERY_START_TIME.set(System.currentTimeMillis());
    }

    /**
     * Called at exit of {@code Frontend.createExecRequest(TQueryCtx, ...)}.
     *
     * <p>Extracts query details from TQueryCtx and TExecRequest using reflection,
     * then sends the event to the collector endpoint asynchronously.</p>
     *
     * @param execRequestObj TExecRequest return value
     * @param queryCtxObj    TQueryCtx first argument
     */
    public static void onQueryComplete(Object execRequestObj, Object queryCtxObj) {
        try {
            long timestamp = QUERY_START_TIME.get() != null ? QUERY_START_TIME.get() : System.currentTimeMillis();
            QUERY_START_TIME.remove();

            // Extract fields from TQueryCtx via reflection
            // TQueryCtx has: client_request (TClientRequest), session (TSessionState)
            String query = extractQuery(queryCtxObj);
            String user = extractUser(queryCtxObj);
            String delegateUser = extractDelegateUser(queryCtxObj);

            // Extract plan from TExecRequest via reflection
            String plan = extractPlan(execRequestObj);

            // Send event asynchronously
            QuerySender.send(timestamp, query, plan, user, delegateUser);

        } catch (Exception e) {
            // Agent must never crash the host process
            System.err.println(LOG_PREFIX + "Error capturing query event: " + e.getMessage());
        }
    }

    /**
     * Extract query text from TQueryCtx.
     *
     * <p>Path: TQueryCtx.client_request.stmt</p>
     */
    private static String extractQuery(Object queryCtx) {
        try {
            // TQueryCtx.getClient_request() → TClientRequest
            Object clientRequest = invoke(queryCtx, "getClient_request");
            if (clientRequest == null) return null;

            // TClientRequest.getStmt() → String
            Object stmt = invoke(clientRequest, "getStmt");
            return stmt != null ? stmt.toString() : null;
        } catch (Exception e) {
            return tryFieldAccess(queryCtx, "client_request", "stmt");
        }
    }

    /**
     * Extract connected user from TQueryCtx.
     *
     * <p>Path: TQueryCtx.session.connected_user</p>
     */
    private static String extractUser(Object queryCtx) {
        try {
            Object session = invoke(queryCtx, "getSession");
            if (session == null) return null;

            Object user = invoke(session, "getConnected_user");
            return user != null ? user.toString() : null;
        } catch (Exception e) {
            return tryFieldAccess(queryCtx, "session", "connected_user");
        }
    }

    /**
     * Extract delegate user from TQueryCtx.
     *
     * <p>Path: TQueryCtx.session.delegated_user</p>
     */
    private static String extractDelegateUser(Object queryCtx) {
        try {
            Object session = invoke(queryCtx, "getSession");
            if (session == null) return null;

            Object delegatedUser = invoke(session, "getDelegated_user");
            return delegatedUser != null ? delegatedUser.toString() : null;
        } catch (Exception e) {
            return tryFieldAccess(queryCtx, "session", "delegated_user");
        }
    }

    /**
     * Extract query plan from TExecRequest.
     *
     * <p>Path: TExecRequest.query_exec_request.query_plan (or TExecRequest.summary)</p>
     */
    private static String extractPlan(Object execRequest) {
        try {
            // Try TExecRequest.getQuery_exec_request().getQuery_plan()
            Object queryExecRequest = invoke(execRequest, "getQuery_exec_request");
            if (queryExecRequest != null) {
                Object plan = invoke(queryExecRequest, "getQuery_plan");
                if (plan != null) return plan.toString();
            }

            // Fallback: TExecRequest.getQuery_plan() (varies by Impala version)
            Object plan = invoke(execRequest, "getQuery_plan");
            if (plan != null) return plan.toString();

            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Invoke a no-arg method on an object via reflection.
     */
    private static Object invoke(Object target, String methodName) {
        try {
            Method method = target.getClass().getMethod(methodName);
            return method.invoke(target);
        } catch (NoSuchMethodException e) {
            return null; // Method not found in this Impala version
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Fallback: try direct field access for Thrift generated classes
     * where getters might not follow standard naming.
     */
    private static String tryFieldAccess(Object root, String... fieldPath) {
        try {
            Object current = root;
            for (String field : fieldPath) {
                java.lang.reflect.Field f = current.getClass().getField(field);
                f.setAccessible(true);
                current = f.get(current);
                if (current == null) return null;
            }
            return current.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
