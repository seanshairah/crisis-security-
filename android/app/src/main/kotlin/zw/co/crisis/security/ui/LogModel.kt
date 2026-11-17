package zw.co.crisis.security.ui

import zw.co.crisis.security.R
import zw.co.crisis.security.patrol.ScanOutcome

/** One line of the shift log (handoff v2 "Log — proof of shift"): what happened, how operations sees it, when. */
data class LogRow(val kind: Kind, val icon: Int, val tone: Tone, val title: String, val status: String, val time: String, val at: Long) {
    enum class Kind { PATROL, ALERT }
    enum class Tone { OK, WARN, CRITICAL, NEUTRAL }
}

object LogMapper {
    fun patrol(checkpoint: String, state: String, decision: String?, localDecision: String?, time: String, at: Long, problemText: String = "Needs attention"): LogRow {
        val outcome = if (decision == null && state != "QUEUED") ScanOutcome.PROBLEM else ScanOutcome.of(decision, localDecision)
        return when (outcome) {
            ScanOutcome.VERIFIED -> LogRow(LogRow.Kind.PATROL, R.drawable.ms_check_circle, LogRow.Tone.OK, checkpoint, "Verified", time, at)
            ScanOutcome.SAVED -> LogRow(LogRow.Kind.PATROL, R.drawable.ms_cloud_off, LogRow.Tone.WARN, checkpoint, "Saved offline · awaiting confirmation", time, at)
            ScanOutcome.PROBLEM -> LogRow(LogRow.Kind.PATROL, R.drawable.ms_error, LogRow.Tone.CRITICAL, checkpoint, problemText, time, at)
        }
    }

    fun alert(type: String, label: String, status: String, stateText: String, time: String, at: Long): LogRow {
        val icon = when (type) {
            "EMERGENCY" -> R.drawable.ms_emergency; "NEED_ASSISTANCE" -> R.drawable.ms_support_agent; "SHIFT_OK" -> R.drawable.ms_thumb_up
            "RUNNING_LATE" -> R.drawable.ms_schedule; "HANDOVER" -> R.drawable.ms_swap_horiz; "STATUS_UPDATE" -> R.drawable.ms_chat; else -> R.drawable.ms_report
        }
        val tone = when (status) { "ACKNOWLEDGED", "RESOLVED" -> LogRow.Tone.OK; "QUEUED" -> LogRow.Tone.WARN; "FAILED" -> LogRow.Tone.CRITICAL; else -> LogRow.Tone.NEUTRAL }
        return LogRow(LogRow.Kind.ALERT, icon, tone, label, stateText, time, at)
    }

    fun filter(rows: List<LogRow>, kind: LogRow.Kind?): List<LogRow> = rows.filter { kind == null || it.kind == kind }.sortedByDescending { it.at }
}
