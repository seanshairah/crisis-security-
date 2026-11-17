package zw.co.crisis.security.ui

/** The line above the tab bar on every guard screen: one sentence about whether this phone's work has reached operations. */
object SyncLine {
    data class View(val ok: Boolean, val text: String, val bar: Boolean)

    fun of(online: Boolean, pending: Int, lastSyncAgoMs: Long?): View = when {
        !online -> View(false, if (pending > 0) "No signal · $pending saved, will send when online" else "No signal · nothing waiting to send", bar = true)
        pending > 0 -> View(false, "Sending $pending saved ${if (pending == 1) "item" else "items"}…", bar = true)
        else -> View(true, "Up to date · synced ${ago(lastSyncAgoMs)}", bar = false)
    }

    fun ago(ms: Long?): String = when {
        ms == null || ms < 0 -> "when online"
        ms < 90_000 -> "just now"
        ms < 3_600_000 -> "${ms / 60_000} min ago"
        else -> "${ms / 3_600_000} h ago"
    }
}
