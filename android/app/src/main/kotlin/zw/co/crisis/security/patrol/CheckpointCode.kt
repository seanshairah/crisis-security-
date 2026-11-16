package zw.co.crisis.security.patrol

import java.security.MessageDigest
import kotlin.math.abs
import zw.co.crisis.security.geofence.*

data class CoordinateCheckpoint(val id: String, val siteId: String, val latitude: Double, val longitude: Double, val radiusM: Int)
object CheckpointCode {
    fun sha256(raw: String): String = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) }
    /** The exact hash comes from authenticated cached shift data; the server also checks its HMAC. */
    fun verified(raw: String, trustedHash: String, expected: CoordinateCheckpoint): CoordinateCheckpoint? {
        if (!expected.latitude.isFinite() || !expected.longitude.isFinite() || sha256(raw) != trustedHash) return null
        val p = raw.split('|')
        if (p.size != 8 || p[0] != "CS2" || p[1] != expected.id || p[2] != expected.siteId) return null
        if (!p[3].matches(Regex("-?\\d{1,3}\\.\\d{6}")) || !p[4].matches(Regex("-?\\d{1,3}\\.\\d{6}")) || !p[6].matches(Regex("[A-Za-z0-9_-]{22}")) || !p[7].matches(Regex("[A-Za-z0-9_-]{43}"))) return null
        val lat = p[3].toDoubleOrNull() ?: return null; val lng = p[4].toDoubleOrNull() ?: return null; val radius = p[5].toIntOrNull() ?: return null
        if (!lat.isFinite() || !lng.isFinite() || abs(lat) > 90 || abs(lng) > 180 || radius !in 10..500 || abs(lat-expected.latitude)>0.00000051 || abs(lng-expected.longitude)>0.00000051 || radius != expected.radiusM) return null
        return CoordinateCheckpoint(p[1], p[2], lat, lng, radius)
    }
    fun gpsTimeValid(scanAt: Long, gpsAt: Long, now: Long): Boolean = gpsAt >= scanAt - 10_000 && gpsAt <= scanAt + 90_000 && gpsAt <= now + 30_000
    fun locationDecision(checkpoint: CoordinateCheckpoint, latitude: Double?, longitude: Double?, accuracyM: Float?, mock: Boolean): String {
        if (mock) return "MOCK_LOCATION"
        if (latitude == null || longitude == null || accuracyM == null || !latitude.isFinite() || !longitude.isFinite() || !accuracyM.isFinite() || accuracyM <= 0 || abs(latitude)>90 || abs(longitude)>180) return "GPS_UNCERTAIN"
        val fix = classify(latitude, longitude, accuracyM, Site(checkpoint.id, "checkpoint", checkpoint.latitude, checkpoint.longitude, checkpoint.radiusM), 50)
        return when(fix.state) { LocState.INSIDE -> "LOCAL_MATCH"; LocState.OUTSIDE -> "OUTSIDE_CHECKPOINT"; LocState.UNKNOWN -> "GPS_UNCERTAIN" }
    }
}
