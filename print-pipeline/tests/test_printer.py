"""The printer client without a printer: MQTT packets, status parsing and the start command (standard library only)."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import printer  # noqa: E402


class MqttPacketTest(unittest.TestCase):
    def test_remaining_length_is_mqtt_s_variable_integer(self):
        self.assertEqual(printer._varint(0), b'\x00')
        self.assertEqual(printer._varint(127), b'\x7f')
        self.assertEqual(printer._varint(128), b'\x80\x01')
        self.assertEqual(printer._varint(16383), b'\xff\x7f')
        self.assertEqual(printer._varint(16384), b'\x80\x80\x01')

    def test_connect_carries_level_4_clean_session_and_the_credentials(self):
        packet = printer.connect_packet('xpot-bench-1', 'bblp', 'CODE1234')
        self.assertEqual(packet[0], 0x10)
        body = packet[2:]
        self.assertEqual(body[:6], b'\x00\x04MQTT')
        self.assertEqual(body[6], 4)
        self.assertEqual(body[7], 0xC2)
        self.assertTrue(body.endswith(b'\x00\x04bblp\x00\x08CODE1234'))
        self.assertEqual(packet[1], len(body))

    def test_publish_and_subscribe(self):
        pub = printer.publish_packet('device/SN/request', b'{}')
        self.assertEqual(pub, b'\x30\x15\x00\x11device/SN/request{}')
        sub = printer.subscribe_packet(1, 'device/SN/report')
        self.assertEqual(sub, b'\x82\x15\x00\x01\x00\x10device/SN/report\x00')


class StatusTest(unittest.TestCase):
    def test_a_full_print_report_becomes_xpot_s_printer_status(self):
        report = {'print': {
            'gcode_state': 'RUNNING', 'mc_percent': 42, 'mc_remaining_time': 161, 'subtask_name': 'LPLATE-2026-007 Menu',
            'layer_num': 9, 'total_layer_num': 23, 'print_error': 0,
            'ams': {'ams': [{'id': '0', 'tray': [{'id': '0', 'tray_color': 'F2F2F2FF', 'tray_type': 'PLA'}, {'id': '1', 'tray_color': '161616FF', 'tray_type': 'PLA'}]}]},
        }}
        status = printer.parse_status(report, 'Jujubinha', 'N2S')
        self.assertEqual(status['state'], 'RUNNING')
        self.assertEqual(status['percent'], 42)
        self.assertEqual(status['remainingMinutes'], 161)
        self.assertIsNone(status['error'])
        self.assertEqual(status['ams'], [{'tray': 0, 'colour': '#F2F2F2', 'type': 'PLA'}, {'tray': 1, 'colour': '#161616', 'type': 'PLA'}])

    def test_partial_reports_and_unknown_states(self):
        self.assertIsNone(printer.parse_status({'print': {'mc_percent': 5}}, 'P'))
        self.assertEqual(printer.parse_status({'print': {'gcode_state': 'SLICING'}}, 'P')['state'], 'UNKNOWN')
        self.assertEqual(printer.parse_status({'print': {'gcode_state': 'FAILED', 'print_error': 50348044}}, 'P')['error'], 'printer error 50348044')


class StartTest(unittest.TestCase):
    def test_the_start_command_points_at_the_uploaded_file_and_maps_the_ams(self):
        cmd = printer.start_command('xpot-1234abcd.gcode.3mf', 'LPLATE-2026-007 Menu', [0, 1])['print']
        self.assertEqual(cmd['command'], 'project_file')
        self.assertEqual(cmd['param'], 'Metadata/plate_1.gcode')
        self.assertEqual(cmd['url'], 'file:///sdcard/xpot-1234abcd.gcode.3mf')
        self.assertEqual(cmd['ams_mapping'], [0, 1])
        self.assertTrue(cmd['use_ams'])
        json.dumps(cmd)
        custom = printer.start_command('a.gcode.3mf', 's', [0], 'ftp:///{file}')['print']
        self.assertEqual(custom['url'], 'ftp:///a.gcode.3mf')


if __name__ == '__main__':
    unittest.main()
