package zw.co.crisis.security.ui

/**
 * Guard Home (handoff v3) as plain data, so every state can be unit-tested and rendered in the snapshot tests.
 * Checks are random: Home shows a check only while its window is open, never what comes next.
 */
data class HomeWindow(val assignmentId: String, val checkpoint: String, val dueAt: Long, val expiresAt: Long, val latitude: Double?, val longitude: Double?, val done: Boolean)

data class HomeEvent(val kind: Kind, val title: String, val time: String) {
    enum class Kind { VERIFIED, SAVED, PROBLEM, ARRIVED }
}

enum class HomeLocation { INSIDE, OUTSIDE, UNKNOWN }

sealed class HomeState {
    object SignIn : HomeState()
    data class LocationOff(val stillWorking: Boolean = true) : HomeState()
    data class Open(val window: HomeWindow, val remainingMs: Long, val totalMs: Long, val distanceM: Int?, val online: Boolean, val location: HomeLocation, val checksDone: Int) : HomeState()
    data class Clear(val events: List<HomeEvent>) : HomeState()
}

data class HomeModel(val siteLine: String, val greeting: String, val state: HomeState, val message: String? = null, val messageIsError: Boolean = false)

object HomeLogic {
    /** Order matters: no session, then no location (scans could not count), then an open check, then calm. */
    fun resolve(
        hasSession: Boolean, locationUsable: Boolean, windows: List<HomeWindow>, now: Long, sessionEnd: Long,
        online: Boolean, location: HomeLocation, checksDone: Int, distanceTo: (HomeWindow) -> Int?, events: List<HomeEvent>,
    ): HomeState {
        if (!hasSession) return HomeState.SignIn
        if (!locationUsable) return HomeState.LocationOff()
        val open = windows.filter { !it.done && now >= it.dueAt && now <= it.expiresAt && now < sessionEnd }.minByOrNull { it.expiresAt }
        if (open != null) return HomeState.Open(open, open.expiresAt - now, (open.expiresAt - open.dueAt).coerceAtLeast(1), distanceTo(open), online, location, checksDone)
        return HomeState.Clear(events.take(3))
    }

    /** "12:40" for twelve minutes forty seconds; hours only when there are some. */
    fun countdown(ms: Long): String {
        val s = (ms.coerceAtLeast(0) + 999) / 1000
        val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
        return if (h > 0) String.format(java.util.Locale.US, "%d:%02d:%02d", h, m, sec) else String.format(java.util.Locale.US, "%02d:%02d", m, sec)
    }

    fun progress(remainingMs: Long, totalMs: Long): Float = if (totalMs <= 0) 0f else (remainingMs.toFloat() / totalMs).coerceIn(0f, 1f)

    fun greeting(hour: Int, fullName: String): String {
        val part = when (hour) { in 5..11 -> "Morning"; in 12..16 -> "Afternoon"; else -> "Evening" }
        val first = fullName.trim().split(Regex("\\s+")).firstOrNull()?.takeIf { it.isNotBlank() }
        return if (first == null) part else "$part, $first"
    }

    fun subline(w: HomeWindow, distanceM: Int?): String = listOfNotNull("left to scan", w.checkpoint, distanceM?.let { "$it m away" }).joinToString(" · ")
}
