package zw.co.crisis.security.ui

import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import zw.co.crisis.security.R
import zw.co.crisis.security.alerts.AlertSender
import zw.co.crisis.security.data.EventQueue
import zw.co.crisis.security.data.Prefs
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Shown right after an emergency is sent (handoff v2 "Emergency — sent"). The alert has already gone; it is never held
 * back. This screen reports how far it has got (saved, received, acknowledged). For five seconds the guard can tell
 * operations it was a mistake, which sends a message and does NOT retract the alert (docs/DECISIONS.md §1).
 */
class EmergencySentActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val poll = object : Runnable { override fun run() { render(); handler.postDelayed(this, 2000) } }
    private lateinit var holder: FrameLayout
    private lateinit var eventId: String
    private var online = true
    private var timer: CountDownTimer? = null
    private var secondsLeft: Int? = 5
    private var mistakeSent = false
    private val clock = SimpleDateFormat("HH:mm", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        eventId = intent.getStringExtra(EXTRA_EVENT_ID) ?: run { finish(); return }
        online = intent.getBooleanExtra(EXTRA_ONLINE, true)
        holder = FrameLayout(this)
        GuardChrome.install(this, holder, null, GuardChrome.Glow.CRITICAL)
        timer = object : CountDownTimer(5000, 1000) {
            override fun onTick(msLeft: Long) { secondsLeft = ((msLeft + 999) / 1000).toInt(); render() }
            override fun onFinish() { secondsLeft = null; render() }
        }.also { it.start() }
        render()
    }

    override fun onResume() { super.onResume(); handler.post(poll) }
    override fun onPause() { handler.removeCallbacks(poll); super.onPause() }
    override fun onDestroy() { timer?.cancel(); super.onDestroy() }

    private fun render() {
        val row = EventQueue.get(this).recentComm(30, kind = "ALERT").firstOrNull { it.eventId == eventId }
        val steps = DeliveryTrail.steps(row?.status)
        val texts = listOf(
            "Sent from this phone" to "${clock.format(Date(row?.at ?: System.currentTimeMillis()))} · ${if (row?.hasLocation != false) "position attached" else "no position yet"}",
            when (steps[1].state) {
                DeliveryTrail.StepState.DONE -> "Received by operations" to (row?.sentAt?.let { clock.format(Date(it)) } ?: "")
                DeliveryTrail.StepState.FAILED -> "Not delivered yet" to "It stays saved on this phone and keeps retrying."
                DeliveryTrail.StepState.WAITING -> (if (online) "Sending to operations" else "Waiting for signal") to "It goes the moment the phone connects."
            },
            if (steps[2].state == DeliveryTrail.StepState.DONE) "Acknowledged by ${row?.ackBy ?: "operations"}" to (row?.ackAt?.let { clock.format(Date(it)) } ?: "")
            else "Waiting for someone to acknowledge" to "You will see their name here.",
        )
        val model = GuardScreens.Sent(DeliveryTrail.delivered(row?.status), clock.format(Date(row?.at ?: System.currentTimeMillis())), row?.hasLocation != false, steps.map { it.state }.zip(texts), Prefs(this).opsPhone.isNotBlank())
        val b = GuardScreens.emergencySent(this, model, onMistake = ::tellMistake, onCall = { AlertFlow.callOps(this) { t, _ -> Toast.makeText(this, t, Toast.LENGTH_LONG).show() } }, onBack = { finish() })
        if (mistakeSent) b.setMistakeDone() else b.setCountdown(secondsLeft)
        holder.removeAllViews(); holder.addView(b.view)
    }

    private fun tellMistake() {
        if (mistakeSent) return
        mistakeSent = true; timer?.cancel()
        AlertSender.send(this, AlertSender.Type.STATUS_UPDATE, getString(R.string.sent_mistake_note))
        render()
    }

    companion object {
        const val EXTRA_EVENT_ID = "eventId"
        const val EXTRA_ONLINE = "online"
    }
}
