package zw.co.crisis.security.patrol

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import zw.co.crisis.security.patrol.GateTracks.Tone

class GateTracksTest {
    @Test fun aLocalSaveNeverReadsAsApproved() {
        val t = GateTracks.forLocal("QUEUED")
        assertEquals(listOf("Device", "Gate approval", "Inventory system"), t.map { it.title })
        assertEquals("Saved on phone", t[0].value)
        assertNotEquals(Tone.OK, t[1].tone)
        assertEquals("Not queued", t[2].value)
        assertTrue(GateTracks.advice(t).contains("not server approval"))
    }

    @Test fun reachingTheServerDoesNotDecideTheGate() {
        val t = GateTracks.forLocal("SENT")
        assertEquals(Tone.OK, t[0].tone)
        assertEquals(Tone.WAIT, t[1].tone)
    }

    @Test fun aRefusedCommandAsksForOperations() {
        val t = GateTracks.forLocal("ATTENTION")
        assertEquals(Tone.CRITICAL, t[0].tone)
        assertTrue(GateTracks.advice(t).contains("Operations"))
    }

    @Test fun gateAndInventoryAreIndependent() {
        val m = JSONObject("""{"status":"APPROVED","deliveries":[{"status":"FAILED"}]}""")
        val t = GateTracks.forMovement(m)
        assertEquals(Tone.OK, t[1].tone)
        assertEquals(Tone.WARN, t[2].tone)
        assertEquals("Retrying automatically", t[2].value)
    }

    @Test fun aParkedDeliveryNeedsAttention() {
        val t = GateTracks.forMovement(JSONObject("""{"status":"APPROVED","deliveries":[{"status":"FAILED","deadAt":"2026-11-22T10:00:00Z"}]}"""))
        assertEquals(Tone.CRITICAL, t[2].tone)
    }

    @Test fun reviewIsNotCleared() {
        val t = GateTracks.forMovement(JSONObject("""{"status":"REVIEW","deliveries":[]}"""))
        assertEquals("Review", t[1].chip)
        assertEquals("Not queued", t[2].value)
        assertFalse(GateTracks.advice(t).startsWith("Cleared"))
    }

    @Test fun clearedAndSentAreBothDone() {
        val t = GateTracks.forMovement(JSONObject("""{"status":"APPROVED","deliveries":[{"status":"SENT"}]}"""))
        assertEquals(Tone.OK, t[1].tone); assertEquals(Tone.OK, t[2].tone)
        assertTrue(GateTracks.advice(t).startsWith("Cleared"))
    }
}
