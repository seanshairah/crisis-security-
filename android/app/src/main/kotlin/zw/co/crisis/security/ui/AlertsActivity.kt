package zw.co.crisis.security.ui

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityManager
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import zw.co.crisis.security.R
import zw.co.crisis.security.alerts.AlertSender
import zw.co.crisis.security.data.EventQueue
import zw.co.crisis.security.data.Prefs
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Guard communication (handoff v2 "Alerts"): the emergency hold ring, the messages a guard sends most as tiles, the
 * rest in a list, and what was sent with its delivery state. All sending goes through AlertFlow/AlertSender.
 */
class AlertsActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val refresh = object : Runnable { override fun run() { render(); handler.postDelayed(this, 4000) } }
    private lateinit var chrome: GuardChrome
    private lateinit var holder: FrameLayout
    private var lastTap = 0L
    private val fb = AlertFlow.Feedback { text, _ -> android.widget.Toast.makeText(this, text, android.widget.Toast.LENGTH_LONG).show(); render() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        holder = FrameLayout(this)
        chrome = GuardChrome.install(this, holder, if (Prefs(this).isGuardMode) GuardChrome.Tab.ALERTS else null, GuardChrome.Glow.CRITICAL)
        render()
        // Opened from a quick action: go straight to that action.
        when (intent.getStringExtra(EXTRA_ACTION)) {
            ACTION_EMERGENCY -> AlertFlow.confirmEmergency(this, fb)
            ACTION_ASSISTANCE -> AlertFlow.askMessage(this, AlertSender.Type.NEED_ASSISTANCE, R.string.alert_assistance, R.string.alert_msg_hint_optional, false, fb)
            ACTION_OK -> AlertFlow.send(this, AlertSender.Type.SHIFT_OK, null, fb)
        }
        intent.removeExtra(EXTRA_ACTION)
    }

    override fun onResume() { super.onResume(); handler.post(refresh) }
    override fun onPause() { super.onPause(); handler.removeCallbacks(refresh) }

    /** A nervous double-tap must not send twice: a second tap within 2.5 s is ignored. */
    private fun guard(action: () -> Unit) { val now = System.currentTimeMillis(); if (now - lastTap < 2500) return; lastTap = now; action() }

    private val actions = object : GuardScreens.AlertActions {
        override fun emergency() = AlertFlow.sendEmergency(this@AlertsActivity, fb)
        override fun emergencyAccessible() {
            val am = getSystemService(ACCESSIBILITY_SERVICE) as? AccessibilityManager
            if (am?.isTouchExplorationEnabled == true) AlertFlow.confirmEmergency(this@AlertsActivity, fb)
        }
        override fun assistance() = guard { AlertFlow.askMessage(this@AlertsActivity, AlertSender.Type.NEED_ASSISTANCE, R.string.alert_assistance, R.string.alert_msg_hint_optional, false, fb) }
        override fun ok() = guard { AlertFlow.send(this@AlertsActivity, AlertSender.Type.SHIFT_OK, null, fb) }
        override fun incident() = guard { AlertFlow.askMessage(this@AlertsActivity, AlertSender.Type.INCIDENT_REPORT, R.string.alert_incident, R.string.alert_msg_hint_required, true, fb) }
        override fun late() = guard { AlertFlow.askMessage(this@AlertsActivity, AlertSender.Type.RUNNING_LATE, R.string.alert_late, R.string.alert_msg_hint_optional, false, fb) }
        override fun security() = guard { AlertFlow.askMessage(this@AlertsActivity, AlertSender.Type.SECURITY_ALERT, R.string.alert_security, R.string.alert_msg_hint_required, true, fb) }
        override fun status() = guard { AlertFlow.askMessage(this@AlertsActivity, AlertSender.Type.STATUS_UPDATE, R.string.alert_status, R.string.alert_msg_hint_required, true, fb) }
        override fun handover() = guard { AlertFlow.askMessage(this@AlertsActivity, AlertSender.Type.HANDOVER, R.string.alert_handover, R.string.alert_msg_hint_optional, false, fb) }
        override fun callOps() = AlertFlow.callOps(this@AlertsActivity, fb)
    }

    private fun render() {
        val f = SimpleDateFormat("HH:mm", Locale.getDefault())
        val history = EventQueue.get(this).recentComm(30, kind = "ALERT").map { r -> LogMapper.alert(r.type, labelFor(r.type), r.status, commStateText(this, r), f.format(Date(r.at)), r.at) }
        holder.removeAllViews()
        holder.addView(GuardScreens.alerts(this, history, Prefs(this).opsPhone.isNotBlank(), actions))
        chrome.refreshSync()
    }

    companion object {
        const val EXTRA_ACTION = "action"
        const val ACTION_EMERGENCY = "EMERGENCY"
        const val ACTION_ASSISTANCE = "ASSISTANCE"
        const val ACTION_OK = "OK"

        fun open(context: android.content.Context, action: String?) {
            context.startActivity(Intent(context, AlertsActivity::class.java).apply { action?.let { putExtra(EXTRA_ACTION, it) } })
        }

        fun labelFor(type: String): String = when (type) { "EMERGENCY" -> "EMERGENCY"; "NEED_ASSISTANCE" -> "Need assistance"; "INCIDENT_REPORT" -> "Incident report"; "SECURITY_ALERT" -> "Security alert"; "RUNNING_LATE" -> "Running late"; "STATUS_UPDATE" -> "Status update"; "SHIFT_OK" -> "Shift going well"; "HANDOVER" -> "Handover"; "LOCATION_REQUEST" -> "Operations asked for your position"; "LOCATION_REQUEST_RESULT" -> "Position sent"; else -> type.lowercase().replace('_', ' ') }

        /** Delivery / acknowledgement wording shared by the dashboard and the Alerts screen. */
        fun commStateText(ctx: android.content.Context, r: EventQueue.CommRow): String {
            val f = SimpleDateFormat("HH:mm", Locale.getDefault())
            return when (r.status) {
                "QUEUED" -> ctx.getString(R.string.alert_state_queued)
                "SENT" -> if (r.kind == "ALERT") ctx.getString(R.string.alert_state_sent, f.format(Date(r.sentAt ?: r.at))) else ctx.getString(R.string.delivery_sent, f.format(Date(r.sentAt ?: r.at)))
                "ACKNOWLEDGED" -> ctx.getString(R.string.alert_state_acked, r.ackBy ?: "operations", r.ackAt?.let { f.format(Date(it)) } ?: "", r.ackNote?.let { " · “$it”" } ?: "")
                "RESOLVED" -> ctx.getString(R.string.alert_state_resolved, r.ackBy ?: "operations", r.ackNote?.let { " · “$it”" } ?: "")
                else -> ctx.getString(R.string.alert_state_failed, r.ackNote ?: "")
            }
        }

        fun commStateColour(r: EventQueue.CommRow): Int = when (r.status) { "QUEUED" -> R.color.warn_strong; "FAILED" -> R.color.critical; "ACKNOWLEDGED", "RESOLVED" -> R.color.ok; else -> R.color.ink2 }
    }
}
