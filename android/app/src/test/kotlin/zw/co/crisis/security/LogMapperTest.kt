package zw.co.crisis.security

import org.junit.Assert.assertEquals
import org.junit.Test
import zw.co.crisis.security.ui.LogMapper
import zw.co.crisis.security.ui.LogRow

class LogMapperTest {
    @Test fun `scans read verified, saved offline, or the problem`() {
        assertEquals(LogRow.Tone.OK, LogMapper.patrol("Gate", "RECEIVED", "ACCEPTED", "LOCAL_MATCH", "21:04", 1, "x").tone)
        val saved = LogMapper.patrol("Gate", "QUEUED", null, "LOCAL_MATCH", "21:45", 2, "x")
        assertEquals(LogRow.Tone.WARN, saved.tone); assertEquals("Saved offline · awaiting confirmation", saved.status)
        val bad = LogMapper.patrol("Gate", "RECEIVED", "OUTSIDE_CHECKPOINT", null, "20:30", 3, "Outside the checkpoint")
        assertEquals(LogRow.Tone.CRITICAL, bad.tone); assertEquals("Outside the checkpoint", bad.status)
    }

    @Test fun `alerts are green once a person acknowledged them, amber while queued`() {
        assertEquals(LogRow.Tone.OK, LogMapper.alert("SHIFT_OK", "Shift going well", "ACKNOWLEDGED", "Acknowledged by Rumbi", "21:00", 1).tone)
        assertEquals(LogRow.Tone.WARN, LogMapper.alert("NEED_ASSISTANCE", "Need assistance", "QUEUED", "Saved on phone", "21:00", 1).tone)
        assertEquals(LogRow.Tone.NEUTRAL, LogMapper.alert("EMERGENCY", "Emergency", "SENT", "Received", "21:00", 1).tone)
    }

    @Test fun `filters keep newest first`() {
        val rows = listOf(LogMapper.alert("SHIFT_OK", "a", "SENT", "", "", 1), LogMapper.patrol("b", "RECEIVED", "ACCEPTED", null, "", 3, ""), LogMapper.patrol("c", "RECEIVED", "ACCEPTED", null, "", 2, ""))
        assertEquals(listOf("b", "c", "a"), LogMapper.filter(rows, null).map { it.title })
        assertEquals(listOf("b", "c"), LogMapper.filter(rows, LogRow.Kind.PATROL).map { it.title })
    }
}
