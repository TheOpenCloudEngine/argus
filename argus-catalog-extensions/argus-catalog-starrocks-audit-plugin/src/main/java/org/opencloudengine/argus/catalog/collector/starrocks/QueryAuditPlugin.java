package org.opencloudengine.argus.catalog.collector.starrocks;

import com.starrocks.plugin.AuditEvent;
import com.starrocks.plugin.AuditPlugin;
import com.starrocks.plugin.Plugin;
import com.starrocks.plugin.PluginContext;
import com.starrocks.plugin.PluginInfo;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * StarRocks Audit Plugin that captures AFTER_QUERY events and sends them
 * to the Argus Catalog Metadata Sync collector endpoint via HTTP POST.
 *
 * <h3>plugin.properties</h3>
 * <pre>
 * name=argus-query-audit
 * type=AUDIT
 * version=1.0.0
 * classname=org.opencloudengine.argus.catalog.collector.starrocks.QueryAuditPlugin
 * </pre>
 *
 * <h3>plugin.conf</h3>
 * <pre>
 * target_url=http://metadata-sync:4610/collector/starrocks/query
 * platform_id=starrocks-019538a3e7c84f2b1
 * </pre>
 *
 * <h3>Installation</h3>
 * <pre>
 * INSTALL PLUGIN FROM "/path/to/argus-query-audit.zip";
 * SHOW PLUGINS;
 * </pre>
 */
public class QueryAuditPlugin extends Plugin implements AuditPlugin {

    private static final String LOG_PREFIX = "[ArgusAuditPlugin] ";

    private QuerySender sender;

    @Override
    public void init(PluginInfo info, PluginContext ctx) throws PluginException {
        super.init(info, ctx);

        // Load configuration from plugin.conf
        Properties conf = loadPluginConf(info);
        String targetUrl = conf.getProperty("target_url", "");
        String platformId = conf.getProperty("platform_id", "");

        if (targetUrl.isEmpty()) {
            throw new PluginException("Missing required property 'target_url' in plugin.conf");
        }

        sender = new QuerySender(targetUrl, platformId);
        System.out.println(LOG_PREFIX + "Plugin initialized.");
        System.out.println(LOG_PREFIX + "  Target URL  : " + targetUrl);
        System.out.println(LOG_PREFIX + "  Platform ID : " + platformId);
    }

    @Override
    public boolean eventFilter(AuditEvent.EventType type) {
        // Only capture completed query events
        return type == AuditEvent.EventType.AFTER_QUERY;
    }

    @Override
    public void exec(AuditEvent event) {
        // This method is called from AuditEventProcessor — must be non-blocking
        try {
            sender.send(event);
        } catch (Exception e) {
            System.err.println(LOG_PREFIX + "Error sending audit event: " + e.getMessage());
        }
    }

    @Override
    public void close() throws IOException {
        if (sender != null) {
            sender.shutdown();
        }
        System.out.println(LOG_PREFIX + "Plugin closed.");
    }

    /**
     * Load plugin.conf from the plugin installation directory.
     */
    private Properties loadPluginConf(PluginInfo info) throws PluginException {
        Properties props = new Properties();
        try {
            // Plugin install path: <fe>/plugins/<plugin-name>/plugin.conf
            Path confPath = info.getSourcePath().resolve("plugin.conf");
            if (Files.exists(confPath)) {
                try (InputStream is = Files.newInputStream(confPath)) {
                    props.load(is);
                }
            } else {
                System.out.println(LOG_PREFIX + "plugin.conf not found at " + confPath
                        + ", using defaults.");
            }
        } catch (IOException e) {
            throw new PluginException("Failed to load plugin.conf: " + e.getMessage());
        }
        return props;
    }
}
