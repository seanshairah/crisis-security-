package zw.co.crisis.security.ui

import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import zw.co.crisis.security.R
import zw.co.crisis.security.alerts.AlertSender
import zw.co.crisis.security.data.EventQueue
import zw.co.crisis.security.data.Prefs

/**
 * Shown right after an emergency is sent. The alert has already gone (it is never held back); this screen
 * only reports how far it has got: saved, received, acknowledged. For five seconds the guard can tell
 * operations it was a mistake. That sends a message and does NOT retract the alert: operations still checks.
 */
class EmergencySentActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val poll = object : Runnable { override fun run() { render(); handler.postDelayed(this, 2000) } }
    private lateinit var eventId: String
    private var online = true
    private var timer: CountDownTimer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_emergency_sent)
        Insets.applySystemBars(findViewById(R.id.root))
        eventId = intent.getStringExtra(EXTRA_EVENT_ID) ?: run { finish(); return }
        online = intent.getBooleanExtra(EXTRA_ONLINE, true)
        findViewById<MaterialButton>(R.id.done).setOnClickListener { finish() }
        val ops = Prefs(this).opsPhone
        findViewById<MaterialButton>(R.id.callOps).apply {
            if (ops.isNotBlank()) { visibility = View.VISIBLE; setOnClickListener { AlertFlow.callOps(this@EmergencySentActivity) { text, _ -> Toast.makeText(this@EmergencySentActivity, text, Toast.LENGTH_LONG).show() } } }
        }
        val mistake = findViewById<MaterialButton>(R.id.mistake)
        mistake.setOnClickListener {
            mistake.visibility = View.GONE; timer?.cancel()
            AlertSender.send(this, AlertSender.Type.STATUS_UPDATE, getString(R.string.sent_mistake_note))
            findViewById<TextView>(R.id.mistakeResult).apply { setText(R.string.sent_mistake_done); visibility = View.VISIBLE }
        }
        timer = object : CountDownTimer(5000, 1000) {
            override fun onTick(msLeft: Long) { mistake.text = getString(R.string.sent_mistake, ((msLeft + 999) / 1000).toInt()) }
            override fun onFinish() { mistake.visibility = View.GONE }
        }.also { it.start() }
        mistake.text = getString(R.string.sent_mistake, 5)
        render()
    }

    override fun onResume() { super.onResume(); handler.post(poll) }
    override fun onPause() { handler.removeCallbacks(poll); super.onPause() }
    override fun onDestroy() { timer?.cancel(); super.onDestroy() }

    private fun render() {
        val row = EventQueue.get(this).recentComm(30, kind = "ALERT").firstOrNull { it.eventId == eventId }
        val status = row?.status
        val delivered = DeliveryTrail.delivered(status)
        findViewById<TextView>(R.id.title).setText(if (delivered) R.string.sent_title_delivered else R.string.sent_title_saved)
        findViewById<TextView>(R.id.subtitle).setText(if (delivered) R.string.sent_sub_delivered else R.string.sent_sub_saved)
        val clock = SimpleDateFormat("HH:mm", Locale.getDefault())
        val steps = DeliveryTrail.steps(status)
        val texts = listOf(
            getString(R.string.trail_saved),
            when (steps[1].state) {
                DeliveryTrail.StepState.DONE -> getString(R.string.trail_received_done) + (row?.sentAt?.let { " · ${clock.format(Date(it))}" } ?: "")
                DeliveryTrail.StepState.FAILED -> getString(R.string.trail_received_failed)
                DeliveryTrail.StepState.WAITING -> getString(R.string.trail_received_waiting)
            },
            if (steps[2].state == DeliveryTrail.StepState.DONE) getString(R.string.trail_ack_done, (row?.ackBy ?: "operations") + (row?.ackAt?.let { " · ${clock.format(Date(it))}" } ?: "")) else getString(R.string.trail_ack_waiting),
        )
        val ids = listOf(R.id.step1Icon to R.id.step1Text, R.id.step2Icon to R.id.step2Text, R.id.step3Icon to R.id.step3Text)
        ids.forEachIndexed { i, (icon, text) ->
            val st = steps[i].state
            val (res, tint) = when (st) {
                DeliveryTrail.StepState.DONE -> R.drawable.ic_check_circle to R.color.ok
                DeliveryTrail.StepState.FAILED -> R.drawable.ic_exclaim to R.color.critical
                DeliveryTrail.StepState.WAITING -> (if (!online && i == 1) R.drawable.ic_offline else R.drawable.ic_clock) to R.color.warn_strong
            }
            findViewById<ImageView>(icon).apply { setImageResource(res); setColorFilter(getColor(tint)) }
            findViewById<TextView>(text).text = texts[i]
        }
    }

    companion object {
        const val EXTRA_EVENT_ID = "eventId"
        const val EXTRA_ONLINE = "online"
    }
}
