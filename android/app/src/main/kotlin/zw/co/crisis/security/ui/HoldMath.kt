package zw.co.crisis.security.ui

/** The hold-to-send ring's arithmetic, apart from the view so it can be tested without a device. */
object HoldMath {
    const val HOLD_MS = 2000L

    fun progress(elapsedMs: Long, holdMs: Long = HOLD_MS): Float =
        if (holdMs <= 0) 1f else (elapsedMs.toFloat() / holdMs.toFloat()).coerceIn(0f, 1f)

    /** Time left to hold when the finger is put down again at [progress] (the ring resumes, it does not restart). */
    fun remainingMs(progress: Float, holdMs: Long = HOLD_MS): Long = ((1f - progress.coerceIn(0f, 1f)) * holdMs).toLong()

    fun sweepDegrees(progress: Float): Float = 360f * progress.coerceIn(0f, 1f)
}
