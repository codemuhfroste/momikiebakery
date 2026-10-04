package com.momikie.momikie_pos

import android.os.Build
import android.view.InputDevice
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Barcode scanners (USB or Bluetooth) present themselves to Android as
        // keyboards, so "is a scanner connected" = is an external keyboard-type
        // device attached. The tablet's own buttons and the on-screen keyboard
        // are internal/virtual and are left out.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "momikie/devices").setMethodCallHandler { call, result ->
            when (call.method) {
                "externalKeyboards" -> {
                    val names = InputDevice.getDeviceIds().toList().mapNotNull { id ->
                        val d = InputDevice.getDevice(id) ?: return@mapNotNull null
                        val keyboard = (d.sources and InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD &&
                            d.keyboardType != InputDevice.KEYBOARD_TYPE_NONE
                        val external = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) d.isExternal else !d.isVirtual
                        if (keyboard && external && !d.isVirtual) d.name else null
                    }
                    result.success(names.distinct())
                }
                else -> result.notImplemented()
            }
        }
    }
}
