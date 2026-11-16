package zw.co.crisis.security.patrol

/** Server-issued random windows, evaluated identically with and without a network. */
object PatrolWindows {
    /** Never rebuild a sign-in form while the guard is typing. */
    fun shouldRefreshScreen(hasSession: Boolean, busy: Boolean): Boolean = hasSession && !busy
    fun isOpen(now: Long, due: Long, expires: Long, sessionEnd: Long): Boolean = now >= due && now <= expires && now < sessionEnd
    fun mayCapture(now: Long, sessionStart: Long, sessionEnd: Long, signedOutAt: Long?): Boolean = now >= sessionStart && now < sessionEnd && (signedOutAt == null || now < signedOutAt)
}
