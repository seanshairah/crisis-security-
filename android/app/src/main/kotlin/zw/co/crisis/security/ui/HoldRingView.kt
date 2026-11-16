package zw.co.crisis.security.ui

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.animation.LinearInterpolator
import zw.co.crisis.security.R

/**
 * A big round button that must be held for two seconds. A ring fills while the finger is down;
 * lifting early cancels, and nothing is sent. This replaces tap-then-confirm for emergencies: it is
 * one deliberate gesture, it cannot be triggered by a pocket tap, and it works with gloves on.
 * Touch-exploration (TalkBack) users get the confirm dialog instead, because holding is not possible there.
 */
class HoldRingView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    var holdMs: Long = HoldMath.HOLD_MS
    var label: String = ""
    var onComplete: (() -> Unit)? = null

    private val density = resources.displayMetrics.density
    private val stroke = 10f * density
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = context.getColor(R.color.critical_solid) }
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; color = context.getColor(R.color.line_strong) }
    private val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; strokeCap = Paint.Cap.ROUND; color = context.getColor(R.color.critical) }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.white); textAlign = Paint.Align.CENTER; textSize = 26f * density; isFakeBoldText = true; letterSpacing = 0.1f }
    private val oval = RectF()
    private var progress = 0f
    private var animator: ValueAnimator? = null
    private var cancelled = false

    init { isClickable = true }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val size = (240 * density).toInt()
        setMeasuredDimension(resolveSize(size, widthMeasureSpec), resolveSize(size, heightMeasureSpec))
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f; val cy = height / 2f
        val radius = minOf(width, height) / 2f - stroke
        canvas.drawCircle(cx, cy, radius - stroke * 0.9f, fillPaint)
        oval.set(cx - radius, cy - radius, cx + radius, cy + radius)
        canvas.drawArc(oval, 0f, 360f, false, trackPaint)
        if (progress > 0f) canvas.drawArc(oval, -90f, HoldMath.sweepDegrees(progress), false, arcPaint)
        canvas.drawText(label, cx, cy - (textPaint.descent() + textPaint.ascent()) / 2f, textPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> { parent?.requestDisallowInterceptTouchEvent(true); begin(); return true }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { abort(); return true }
        }
        return true
    }

    private fun begin() {
        cancelled = false
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        animator?.cancel()
        animator = ValueAnimator.ofFloat(progress, 1f).apply {
            duration = HoldMath.remainingMs(progress, holdMs)
            interpolator = LinearInterpolator()
            addUpdateListener { progress = it.animatedValue as Float; invalidate() }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationCancel(animation: Animator) { cancelled = true }
                override fun onAnimationEnd(animation: Animator) {
                    if (cancelled) return
                    performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                    onComplete?.invoke()
                }
            })
            start()
        }
    }

    private fun abort() {
        animator?.cancel()
        // The ring drains back instead of snapping, so a guard can see that it did not send.
        animator = ValueAnimator.ofFloat(progress, 0f).apply {
            duration = 250
            addUpdateListener { progress = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    override fun onDetachedFromWindow() { animator?.cancel(); super.onDetachedFromWindow() }
}
