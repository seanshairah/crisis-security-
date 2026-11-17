package zw.co.crisis.security.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import zw.co.crisis.security.patrol.ScanOutcome

/** The answer to a checkpoint scan (handoff v2 "Scan result"). Passed in as extras, so it works the same offline. */
class ScanResultActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val outcome = runCatching { ScanOutcome.valueOf(intent.getStringExtra(EXTRA_OUTCOME) ?: "") }.getOrDefault(ScanOutcome.SAVED)
        val m = GuardScreens.ScanResult(outcome, intent.getStringExtra(EXTRA_CHECKPOINT) ?: "Checkpoint", intent.getStringExtra(EXTRA_TIME) ?: "",
            intent.getStringExtra(EXTRA_MESSAGE), intent.getIntExtra(EXTRA_DISTANCE_M, -1), intent.getIntExtra(EXTRA_RADIUS_M, -1), intent.getIntExtra(EXTRA_ACCURACY_M, -1))
        val glow = when (outcome) { ScanOutcome.VERIFIED -> GuardChrome.Glow.OK; ScanOutcome.SAVED -> GuardChrome.Glow.ACCENT; ScanOutcome.PROBLEM -> GuardChrome.Glow.CRITICAL }
        GuardChrome.install(this, GuardScreens.scanResult(this, m, onBack = { finish() }, onHome = { finish() }, onLog = {
            startActivity(Intent(this, ShiftLogActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)); finish()
        }), null, glow)
    }

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
