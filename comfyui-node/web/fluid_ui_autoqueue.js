import { app } from "../../scripts/app.js";

let pollTimer = null;
let lastMtime = 0;
let lastFile = "";

function getWatcherNode() {
    if (!app.graph?._nodes) return null;
    return app.graph._nodes.find(
        n => n.type === "FluidUIImageLoader" &&
             n.widgets?.find(w => w.name === "watch_enabled")?.value === true
    );
}

function getWidgetValue(node, name, fallback) {
    const w = node.widgets?.find(x => x.name === name);
    return w ? w.value : fallback;
}

async function pollFolder() {
    const node = getWatcherNode();
    if (!node) {
        stopPolling();
        return;
    }

    const folder = getWidgetValue(node, "watch_folder", "");
    const pattern = getWidgetValue(node, "pattern", "fluid_*");

    if (!folder) return;

    try {
        const resp = await fetch(
            `/fluid_ui/check?folder=${encodeURIComponent(folder)}&pattern=${encodeURIComponent(pattern)}`
        );
        if (!resp.ok) return;

        const data = await resp.json();
        if (!data.file) return;

        const changed = data.file !== lastFile || data.mtime > lastMtime;
        if (changed && lastMtime > 0) {
            // Only trigger if we had a previous baseline (skip first poll)
            console.log(`[A Small Good Thing] New file: ${data.file} — queuing prompt`);
            app.queuePrompt(0, 1);
        }

        lastFile = data.file;
        lastMtime = data.mtime;
    } catch (e) {
        // Silently ignore fetch errors (server busy, etc.)
    }
}

function startPolling(intervalSec) {
    stopPolling();
    const ms = Math.max(100, intervalSec * 1000);
    console.log(`[A Small Good Thing] Polling every ${intervalSec}s`);
    pollTimer = setInterval(pollFolder, ms);
    // Do one immediate poll to seed baseline
    pollFolder();
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

app.registerExtension({
    name: "FluidUI.AutoQueue",
    async afterConfigureGraph() {
        // Wait for graph to fully load
        setTimeout(() => {
            const node = getWatcherNode();
            if (node) {
                const interval = getWidgetValue(node, "poll_interval", 1.0);
                console.log("[A Small Good Thing] Watch node found — starting poller");
                startPolling(interval);
            }
        }, 2000);
    },
    async nodeCreated(node) {
        if (node.type !== "FluidUIImageLoader") return;
        // React to widget changes
        const watchWidget = node.widgets?.find(w => w.name === "watch_enabled");
        if (watchWidget) {
            const origCallback = watchWidget.callback;
            watchWidget.callback = (value) => {
                if (origCallback) origCallback(value);
                if (value) {
                    const interval = getWidgetValue(node, "poll_interval", 1.0);
                    startPolling(interval);
                } else {
                    stopPolling();
                }
            };
        }
    }
});
