package org.opencloudengine.argus.catalog.collector.trino;

import io.trino.spi.eventlistener.EventListener;
import io.trino.spi.eventlistener.EventListenerFactory;

import java.util.Map;

/**
 * Factory that creates {@link QueryAuditListener} instances.
 *
 * <p>Configuration is read from {@code etc/event-listener.properties}:</p>
 * <pre>
 * event-listener.name=argus-query-audit
 * target-url=http://metadata-sync:4610/collector/trino/query
 * platform-id=trino-019538a3e7c84f2b1
 * </pre>
 */
public class QueryAuditListenerFactory implements EventListenerFactory {

    private static final String NAME = "argus-query-audit";

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public EventListener create(Map<String, String> config, EventListenerContext context) {
        String targetUrl = config.getOrDefault("target-url", "");
        String platformId = config.getOrDefault("platform-id", "");

        if (targetUrl.isEmpty()) {
            throw new IllegalArgumentException(
                    "Missing required property 'target-url' in event-listener.properties");
        }

        QuerySender sender = new QuerySender(targetUrl, platformId);
        return new QueryAuditListener(sender);
    }
}
