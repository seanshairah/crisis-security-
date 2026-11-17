package zw.co.crisis.security.ui

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.animation.LinearInterpolator
import androidx.core.content.ContextCompat
import zw.co.crisis.security.R

/**
 * The emergency control (handoff v2 "Emergency — holding"): a red disc that must be held for two seconds while a
 * white ring fills around it. Lifting early drains the ring and sends nothing. TalkBack users cannot hold, so a
 * click (double-tap) goes to the click listener, which shows the confirm dialog instead.
 */
class HoldRingView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    var holdMs: Long = HoldMath.HOLD_MS
    var label: String = ""
        set(v) { field = v; invalidate() }
    var onComplete: (() -> Unit)? = null
    var onProgress: ((Float) -> Unit)? = null

    private val density = resources.displayMetrics.density
    private val ringWidth = 12f * density
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = ringWidth; color = 0x22FFFFFF }
    private val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = ringWidth; color = 0xFFFFFFFF.toInt() }
    private val discPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt(); textAlign = Paint.Align.CENTER; textSize = 20f * density; typeface = Ui.font(context, 700) }
    private val icon = ContextCompat.getDrawable(context, R.drawable.ms_emergency)?.mutate()?.apply { setTint(0xFFFFFFFF.toInt()) }
    private val oval = RectF()
    private var progress = 0f
    private var animator: ValueAnimator? = null
    private var cancelled = false

    init { isClickable = true; isFocusable = true }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val size = (210 * density).toInt()
        setMeasuredDimension(resolveSize(size, widthMeasureSpec), resolveSize(size, heightMeasureSpec))
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f; val cy = height / 2f
        val outer = minOf(width, height) / 2f - ringWidth / 2f
        oval.set(cx - outer, cy - outer, cx + outer, cy + outer)
        canvas.drawArc(oval, 0f, 360f, false, trackPaint)
        if (progress > 0f) canvas.drawArc(oval, -90f, HoldMath.sweepDegrees(progress), false, arcPaint)
        val disc = outer - ringWidth / 2f
        discPaint.shader = LinearGradient(cx - disc, cy - disc, cx + disc, cy + disc, 0xFFE5452F.toInt(), 0xFF9C1F12.toInt(), Shader.TileMode.CLAMP)
        canvas.drawCircle(cx, cy, disc, discPaint)
        val iconSize = (54 * density).toInt()
        icon?.setBounds((cx - iconSize / 2).toInt(), (cy - iconSize * 0.85f).toInt(), (cx + iconSize / 2).toInt(), (cy + iconSize * 0.15f).toInt())
        icon?.draw(canvas)
        canvas.drawText(label, cx, cy + 34f * density, textPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> { parent?.requestDisallowInterceptTouchEvent(true); begin() }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> abort()
        }
        return true
    }

    private fun setProgress(p: Float) { progress = p; invalidate(); onProgress?.invoke(p) }

    private fun begin() {
        cancelled = false
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        animator?.cancel()
        animator = ValueAnimator.ofFloat(progress, 1f).apply {
            duration = HoldMath.remainingMs(progress, holdMs)
            interpolator = LinearInterpolator()
            addUpdateListener { setProgress(it.animatedValue as Float) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationCancel(animation: Animator) { cancelled = true }
                override fun onAnimationEnd(animation: Animator) {
                    if (cancelled) return
                    performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                    onComplete?.invoke()
                    setProgress(0f)
                }
            })
            start()
        }
    }

    private fun abort() {
        if (progress >= 1f) return
        animator?.cancel()
        animator = ValueAnimator.ofFloat(progress, 0f).apply { duration = 250; addUpdateListener { setProgress(it.animatedValue as Float) }; start() }
    }

    override fun onDetachedFromWindow() { animator?.cancel(); super.onDetachedFromWindow() }
}
