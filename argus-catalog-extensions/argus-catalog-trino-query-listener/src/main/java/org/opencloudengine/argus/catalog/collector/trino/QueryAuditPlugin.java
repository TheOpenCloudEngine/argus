package org.opencloudengine.argus.catalog.collector.trino;

import io.trino.spi.Plugin;
import io.trino.spi.eventlistener.EventListenerFactory;

import java.util.List;

/**
 * Trino Plugin entry point that registers the query audit EventListenerFactory.
 */
public class QueryAuditPlugin implements Plugin {

    @Override
    public Iterable<EventListenerFactory> getEventListenerFactories() {
        return List.of(new QueryAuditListenerFactory());
    }
}
