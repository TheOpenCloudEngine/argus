package org.opencloudengine.argus.catalog.collector.impala;

/**
 * Agent configuration parsed from the {@code -javaagent} argument string.
 *
 * <p>Format: {@code key1=value1,key2=value2,...}</p>
 *
 * <p>Supported keys:</p>
 * <ul>
 *   <li>{@code targetUrl} — Collector endpoint URL</li>
 *   <li>{@code platformId} — Argus Catalog platform ID</li>
 *   <li>{@code enabled} — true/false (default: true)</li>
 * </ul>
 */
public class AgentConfig {

    private String targetUrl;
    private String platformId = "";
    private boolean enabled = true;

    public String getTargetUrl() {
        return targetUrl;
    }

    public String getPlatformId() {
        return platformId;
    }

    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Parse agent argument string into config object.
     *
     * @param agentArgs comma-separated key=value pairs
     * @return parsed config
     */
    public static AgentConfig parse(String agentArgs) {
        AgentConfig config = new AgentConfig();
        if (agentArgs == null || agentArgs.trim().isEmpty()) {
            return config;
        }
        for (String pair : agentArgs.split(",")) {
            String[] kv = pair.split("=", 2);
            if (kv.length != 2) continue;
            String key = kv[0].trim();
            String value = kv[1].trim();
            switch (key) {
                case "targetUrl":
                    config.targetUrl = value;
                    break;
                case "platformId":
                    config.platformId = value;
                    break;
                case "enabled":
                    config.enabled = "true".equalsIgnoreCase(value);
                    break;
            }
        }
        return config;
    }
}
