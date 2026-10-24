import importlib.machinery
import importlib.util
import unittest
from unittest.mock import Mock, patch

from pathlib import Path
path = str(Path(__file__).with_name('monitor_auto_off.pyw'))
loader = importlib.machinery.SourceFileLoader('auto_off', path)
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

class ShutdownTests(unittest.TestCase):
    def make(self, action):
        power = Mock()
        detector = Mock(return_value=action)
        return module.SessionController(power, detector), power, detector

    def test_confirmed_russian_power_off(self):
        controller, power, detector = self.make('Выключение питания')
        self.assertEqual(controller.query(0), 1)
        self.assertTrue(controller.end(True, 0))
        power.assert_called_once_with()

    def test_cancel_does_not_switch_off_or_reuse_shutdown_reason(self):
        controller, power, detector = self.make('power off')
        controller.query(0)
        self.assertFalse(controller.end(False, 0))
        power.assert_not_called()
        self.assertIsNone(controller.action)
        detector.return_value = 'restart'
        controller.query(0)
        self.assertFalse(controller.end(True, 0))
        power.assert_not_called()

    def test_restart_logoff_and_update_leave_display_on(self):
        for action, flags in [('restart', 0), ('Перезагрузка', 0),
                              ('power off', module.LOGOFF),
                              ('power off', module.CLOSEAPP),
                              ('Перезапустить', 0)]:
            with self.subTest(action=action, flags=flags):
                controller, power, detector = self.make(action)
                self.assertEqual(controller.query(flags), 1)
                self.assertFalse(controller.end(True, flags))
                power.assert_not_called()

    def test_missing_event_does_not_skip_confirmed_shutdown(self):
        controller, power, detector = self.make(None)
        self.assertEqual(controller.query(0), 1)
        self.assertTrue(controller.end(True, 0))
        power.assert_called_once_with()

    def test_inaccessible_event_log_does_not_skip_confirmed_shutdown(self):
        controller, power, detector = self.make(None)
        detector.side_effect = PermissionError('event log not available')
        self.assertEqual(controller.query(0), 1)
        self.assertTrue(controller.end(True, 0))
        power.assert_called_once_with()

    def test_cancel_with_missing_event_does_not_switch_off(self):
        controller, power, detector = self.make(None)
        controller.query(0)
        self.assertFalse(controller.end(False, 0))
        power.assert_not_called()

    def test_end_without_query_can_resolve_confirmed_shutdown(self):
        controller, power, detector = self.make('Завершить работу')
        self.assertTrue(controller.end(True, 0))
        power.assert_called_once_with()

class WakeCommandTests(unittest.TestCase):
    def test_on_uses_resident_listener(self):
        with patch.object(module.sys, 'argv', ['monitor_auto_off.pyw', '--on']), \
             patch.object(module, 'send', return_value=1) as send, \
             patch.object(module, 'Monitor') as monitor:
            module.main()
            send.assert_called_once_with(module.POWER_ON)
            monitor.assert_not_called()

    def test_on_without_listener_closes_ddc_handles(self):
        with patch.object(module.sys, 'argv', ['monitor_auto_off.pyw', '--on']), \
             patch.object(module, 'send', return_value=None), \
             patch.object(module, 'Monitor') as monitor:
            monitor.return_value.power.return_value = 1
            module.main()
            monitor.return_value.refresh.assert_called_once_with()
            monitor.return_value.power.assert_called_once_with(1)
            monitor.return_value.close.assert_called_once_with()

if __name__ == '__main__':
    unittest.main()
