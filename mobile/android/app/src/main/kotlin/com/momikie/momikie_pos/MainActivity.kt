package com.momikie.momikie_pos

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.view.InputDevice
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val printer by lazy { BluetoothPrinter(applicationContext) }
    private var permissionResult: MethodChannel.Result? = null

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

        // The Bluetooth receipt printer (see BluetoothPrinter).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "momikie/printer").setMethodCallHandler { call, result ->
            when (call.method) {
                "granted" -> result.success(printer.granted())
                "requestPermission" -> {
                    if (printer.granted()) {
                        result.success(true)
                    } else {
                        permissionResult?.success(false)
                        permissionResult = result
                        requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), PERMISSION_REQUEST)
                    }
                }
                "enabled" -> result.success(printer.enabled())
                "paired" -> result.success(printer.paired())
                "write" -> {
                    val addr = call.argument<String>("address")
                    val bytes = call.argument<ByteArray>("bytes")
                    if (addr == null || bytes == null) result.success("error: nothing to print")
                    else printer.run(result) { printer.write(addr, bytes) }
                }
                "disconnect" -> printer.run(result) {
                    printer.close()
                    null
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST) {
            permissionResult?.success(grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
            permissionResult = null
        }
    }

    companion object {
        private const val PERMISSION_REQUEST = 4711
    }
}
