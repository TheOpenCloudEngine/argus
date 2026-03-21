package org.opencloudengine.argus.catalog.collector.impala;

import java.lang.instrument.Instrumentation;

/**
 * Java Agent entry point for Impala query collection.
 *
 * <p>Attaches to the Impala daemon JVM and instruments the Frontend class
 * to intercept query execution. Captured query events (timestamp, query,
 * plan, user, delegate user) are sent via HTTP POST to the Argus Catalog
 * Metadata Sync collector endpoint.</p>
 *
 * <h3>Usage</h3>
 * <pre>
 * # Add to Impala daemon JVM options:
 * -javaagent:/path/to/impala-query-agent-1.0.0.jar=targetUrl=http://host:4610/collector/impala/query,platformId=impala-19d0bfe954e3fd2cd
 * </pre>
 *
 * <h3>Agent Parameters</h3>
 * <ul>
 *   <li>{@code targetUrl} — Collector endpoint URL (required)</li>
 *   <li>{@code platformId} — Argus Catalog platform ID (required)</li>
 *   <li>{@code enabled} — Enable/disable agent (default: true)</li>
 * </ul>
 *
 * @author KIM BYOUNG GON (fharenheit@gmail.com)
 */
public class ImpalaQueryAgent {

    private static final String LOG_PREFIX = "[ImpalaQueryAgent] ";

    public static void premain(String agentArgs, Instrumentation inst) {
        AgentConfig config = AgentConfig.parse(agentArgs);

        if (!config.isEnabled()) {
            System.out.println(LOG_PREFIX + "Agent is disabled.");
            return;
        }

        if (config.getTargetUrl() == null || config.getTargetUrl().isEmpty()) {
            System.err.println(LOG_PREFIX + "ERROR: targetUrl is required. "
                    + "Usage: -javaagent:impala-query-agent.jar=targetUrl=http://host:port/collector/impala/query,platformId=xxx");
            return;
        }

        // Initialize the query sender
        QuerySender.initialize(config.getTargetUrl(), config.getPlatformId());

        // Register the class transformer
        inst.addTransformer(new ImpalaQueryTransformer(), true);

        System.out.println(LOG_PREFIX + "Agent loaded successfully.");
        System.out.println(LOG_PREFIX + "  Target URL  : " + config.getTargetUrl());
        System.out.println(LOG_PREFIX + "  Platform ID : " + config.getPlatformId());
    }
}
