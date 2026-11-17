package zw.co.crisis.security.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

/**
 * The ring around Home's centre control (handoff v3): a progress arc for the time left on an open check, or a dashed
 * circle when nothing is open. Draws only the ring; the disc inside is an ordinary view.
 */
class RingView(context: Context) : View(context) {
    var progress = 0f; set(v) { field = v.coerceIn(0f, 1f); invalidate() }
    var trackColor = 0; var arcColor = 0; var dashed = false
    var strokePx = 0f

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.BUTT }
    private val oval = RectF()

    override fun onDraw(canvas: Canvas) {
        val inset = strokePx / 2f + 1f
        oval.set(inset, inset, width - inset, height - inset)
        paint.strokeWidth = strokePx
        paint.pathEffect = if (dashed) DashPathEffect(floatArrayOf(strokePx * 3f, strokePx * 2.5f), 0f) else null
        paint.color = trackColor
        canvas.drawArc(oval, 0f, 360f, false, paint)
        if (!dashed && progress > 0f) {
            paint.color = arcColor
            canvas.drawArc(oval, -90f, 360f * progress, false, paint)
        }
    }
}
