package zw.co.crisis.security.ui

import android.os.Bundle
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import zw.co.crisis.security.R
import zw.co.crisis.security.patrol.ScanOutcome

/** The answer to a checkpoint scan. Passed in as extras, so it works the same offline as online. */
class ScanResultActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_scan_result)
        Insets.applySystemBars(findViewById(R.id.root))
        val outcome = runCatching { ScanOutcome.valueOf(intent.getStringExtra(EXTRA_OUTCOME) ?: "") }.getOrDefault(ScanOutcome.SAVED)
        val (icon, tint, soft, title) = when (outcome) {
            ScanOutcome.VERIFIED -> Look(R.drawable.ic_check_circle, R.color.ok, R.drawable.circle_green_soft, R.string.scan_title_verified)
            ScanOutcome.SAVED -> Look(R.drawable.ic_clock, R.color.warn_strong, R.drawable.circle_amber_soft, R.string.scan_title_saved)
            ScanOutcome.PROBLEM -> Look(R.drawable.ic_exclaim, R.color.critical, R.drawable.circle_red_soft, R.string.scan_title_problem)
        }
        findViewById<FrameLayout>(R.id.halo).setBackgroundResource(soft)
        findViewById<ImageView>(R.id.icon).apply { setImageResource(icon); setColorFilter(getColor(tint)) }
        findViewById<TextView>(R.id.title).setText(title)
        findViewById<TextView>(R.id.checkpoint).text = intent.getStringExtra(EXTRA_CHECKPOINT)
        findViewById<TextView>(R.id.meta).text = listOfNotNull(intent.getStringExtra(EXTRA_TIME), if (outcome == ScanOutcome.VERIFIED) getString(R.string.scan_confirmed) else intent.getStringExtra(EXTRA_MESSAGE)).joinToString(" · ")

        val distance = intent.getIntExtra(EXTRA_DISTANCE_M, -1)
        val radius = intent.getIntExtra(EXTRA_RADIUS_M, -1)
        val accuracy = intent.getIntExtra(EXTRA_ACCURACY_M, -1)
        findViewById<TextView>(R.id.distance).text = when {
            distance < 0 -> getString(R.string.scan_stat_none)
            radius >= 0 && distance > radius -> getString(R.string.scan_outside_fence, distance)
            else -> getString(R.string.scan_inside_fence, distance)
        }
        findViewById<TextView>(R.id.accuracy).text = if (accuracy < 0) getString(R.string.scan_stat_none) else getString(R.string.scan_accuracy_value, accuracy)
        if (outcome == ScanOutcome.SAVED) findViewById<TextView>(R.id.note).apply { setText(R.string.scan_note_saved); visibility = android.view.View.VISIBLE }
        findViewById<MaterialButton>(R.id.back).setOnClickListener { finish() }
    }

    private data class Look(val icon: Int, val tint: Int, val soft: Int, val title: Int)

    companion object {
        const val EXTRA_OUTCOME = "outcome"
        const val EXTRA_CHECKPOINT = "checkpoint"
        const val EXTRA_TIME = "time"
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_DISTANCE_M = "distanceM"
        const val EXTRA_RADIUS_M = "radiusM"
        const val EXTRA_ACCURACY_M = "accuracyM"
    }
}
