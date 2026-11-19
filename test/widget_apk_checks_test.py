"""Regression checks for failures that JavaScript widget tests cannot detect."""
import importlib.util
import sys
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('apk_guard', Path(__file__).parents[1] / 'scripts/check-widget-apk.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ApkGuardTests(unittest.TestCase):
    def setUp(self):
        self.root = ET.fromstring('''<manifest package="com.hotrodtymn.matrix" versionCode="14" versionName="1.5.0"><application>
<meta-data name="expo.modules.updates.EXPO_RUNTIME_VERSION" value="@0x7f100001" />
<meta-data name="expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY" value='{"expo-channel-name":"widget-compat-spike"}' />
<receiver name="com.hotrodtymn.matrix.widget.MatrixCompatibility" label="Matrix Compatibility" exported="false">
<intent-filter><action name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
<meta-data name="android.appwidget.provider" resource="@0x7f130001" /></receiver></application></manifest>''')
        self.table = {
            0x7f100001: [{'name': 'string/runtime', 'type': 3, 'value': '1.5.0'}],
            0x7f130001: [{'name': 'xml/widgetprovider_matrixcompatibility', 'type': 3, 'value': 'provider.xml'}],
            0x7f0b0001: [{'name': 'layout/rn_widget', 'type': 3, 'value': 'layout.xml'}],
            0x7f100002: [{'name': 'string/widget_description', 'type': 3, 'value': 'Static test'}],
        }
        self.provider = ET.fromstring('''<appwidget-provider minWidth="180.0dp" minHeight="80.0dp" targetCellWidth="2" targetCellHeight="1" resizeMode="3" widgetCategory="1" updatePeriodMillis="0" initialLayout="@0x7f0b0001" description="@0x7f100002" />''')
        self.files = {'provider.xml': self.provider, 'layout.xml': ET.Element('FrameLayout')}
        self.classes = {'Lcom/hotrodtymn/matrix/widget/MatrixCompatibility;', 'Lcom/reactnativeandroidwidget/RNWidgetProvider;'}
        self.options = dict(version_code=14, channel='widget-compat-spike', expect_widget='present')
        self.app = self.root.find('application')
        self.receiver = self.app.find('receiver')

    def check(self):
        return guard.validate(self.root, self.table, self.files.__getitem__, self.classes, **self.options)

    def test_nonexported_enabled_receiver_is_valid(self):
        self.assertEqual(self.check()['widget'], 'present')

    def test_wrong_build_identity_is_rejected(self):
        for key, value in [('package', 'other.app'), ('versionCode', '13'), ('versionName', '1.4.0')]:
            with self.subTest(key=key):
                old = self.root.get(key)
                self.root.set(key, value)
                with self.assertRaises(ValueError): self.check()
                self.root.set(key, old)
        self.options['channel'] = 'preview'
        with self.assertRaisesRegex(ValueError, 'channel'): self.check()

    def test_wrong_runtime_is_rejected(self):
        self.table[0x7f100001][0]['value'] = '1.4.0'
        with self.assertRaisesRegex(ValueError, 'runtime'): self.check()

    def test_missing_or_disabled_provider_is_rejected(self):
        self.receiver.set('enabled', 'false')
        with self.assertRaisesRegex(ValueError, 'disabled'): self.check()
        self.app.remove(self.receiver)
        with self.assertRaisesRegex(ValueError, 'exactly one'): self.check()

    def test_missing_action_is_rejected(self):
        self.receiver.remove(self.receiver.find('intent-filter'))
        with self.assertRaisesRegex(ValueError, 'APPWIDGET_UPDATE'): self.check()

    def test_missing_or_invalid_provider_metadata_is_rejected(self):
        meta = self.receiver.find('meta-data')
        meta.attrib.pop('resource')
        meta.set('value', '@0x7f130001')
        with self.assertRaisesRegex(ValueError, 'reference'): self.check()
        self.receiver.remove(meta)
        with self.assertRaisesRegex(ValueError, 'metadata'): self.check()

    def test_missing_resource_or_malformed_provider_is_rejected(self):
        self.files['provider.xml'] = ET.Element('not-a-provider')
        with self.assertRaisesRegex(ValueError, 'XML root'): self.check()
        del self.table[0x7f130001]
        with self.assertRaisesRegex(ValueError, 'Unresolved'): self.check()

    def test_category_dimensions_and_layout_are_checked(self):
        self.provider.set('widgetCategory', '2')
        with self.assertRaisesRegex(ValueError, 'home screen'): self.check()
        self.provider.set('widgetCategory', '1')
        self.provider.set('minWidth', '0.0dp')
        with self.assertRaisesRegex(ValueError, 'minWidth'): self.check()
        self.provider.set('minWidth', '180.0dp')
        self.files['layout.xml'] = ET.Element('invalid')
        with self.assertRaisesRegex(ValueError, 'layout'): self.check()

    def test_missing_compiled_provider_is_rejected(self):
        self.classes.remove('Lcom/hotrodtymn/matrix/widget/MatrixCompatibility;')
        with self.assertRaisesRegex(ValueError, 'compiled provider'): self.check()

    def test_recovery_rejects_leftovers_and_accepts_widget_free_apk(self):
        self.options['expect_widget'] = 'absent'
        with self.assertRaisesRegex(ValueError, 'receiver'): self.check()
        self.app.remove(self.receiver)
        with self.assertRaisesRegex(ValueError, 'classes'): self.check()
        self.classes.clear()
        with self.assertRaisesRegex(ValueError, 'XML'): self.check()
        del self.table[0x7f130001]
        self.assertEqual(self.check()['widget'], 'absent')

    def test_functional_today_requires_periodic_refresh_and_cold_start_filter(self):
        self.options['functional_today'] = True
        self.receiver.set('label', 'Matrix Today')
        self.provider.set('updatePeriodMillis', '1800000')
        with self.assertRaisesRegex(ValueError, 'intent filter'): self.check()
        activity = ET.SubElement(self.app, 'activity')
        intent = ET.SubElement(activity, 'intent-filter')
        ET.SubElement(intent, 'data', scheme='matrix-today', host='dashboard', path='/today')
        self.assertEqual(self.check()['widget'], 'present')
        self.provider.set('updatePeriodMillis', '0')
        with self.assertRaisesRegex(ValueError, 'updatePeriodMillis'): self.check()


if __name__ == '__main__':
    unittest.main()
