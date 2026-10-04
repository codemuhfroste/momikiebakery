package com.momikie.momikie_pos

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import io.flutter.plugin.common.MethodChannel
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors

/**
 * The link to a Bluetooth receipt printer: classic Bluetooth serial (SPP),
 * which every cheap thermal printer (PT-210/220, Xprinter, "POS-58"…) speaks.
 *
 * The connection stays open between receipts so each one prints at once,
 * and bytes are sent exactly as given — nothing added — so a status check
 * (DLE EOT) never feeds paper. All Bluetooth work runs on one background
 * thread, one job at a time.
 */
class BluetoothPrinter(private val context: Context) {
    private val spp = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var socket: BluetoothSocket? = null
    private var address: String? = null

    private val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    /** "Nearby devices" is allowed (Android 12+; always true before). */
    fun granted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    fun enabled(): Boolean = adapter?.isEnabled == true

    @SuppressLint("MissingPermission")
    fun paired(): List<Map<String, String>> =
        adapter?.bondedDevices?.map { mapOf("name" to (it.name ?: it.address), "address" to it.address) } ?: emptyList()

    /** Runs [job] on the Bluetooth thread and answers on the main thread. */
    fun run(result: MethodChannel.Result, job: () -> Any?) {
        worker.execute {
            val answer = try {
                job()
            } catch (e: Exception) {
                "error: ${e.message}"
            }
            main.post { result.success(answer) }
        }
    }

    /**
     * Sends [bytes]. Returns null when sent, or why not: "off" (Bluetooth
     * off), "connect" (printer off, out of range or busy), "write" (the link
     * dropped part-way).
     */
    fun write(addr: String, bytes: ByteArray): String? {
        if (!enabled()) return "off"
        for (attempt in 1..2) {
            try {
                open(addr)
            } catch (e: Exception) {
                return "connect"
            }
            var sent = 0
            try {
                val out = socket!!.outputStream
                // Small pieces with a short pause: cheap printers drop data
                // that arrives faster than they print.
                while (sent < bytes.size) {
                    val n = minOf(256, bytes.size - sent)
                    out.write(bytes, sent, n)
                    out.flush()
                    sent += n
                    if (sent < bytes.size) Thread.sleep(20)
                }
                return null
            } catch (e: IOException) {
                // A link left over from before the printer was switched off
                // fails on the first write: reconnect and send it all again.
                // Past that, part of it already printed — don't print twice.
                close()
                if (sent > 0) return "write"
            }
        }
        return "write"
    }

    fun close() {
        try {
            socket?.close()
        } catch (_: Exception) {
        }
        socket = null
        address = null
    }

    @SuppressLint("MissingPermission")
    private fun open(addr: String) {
        if (socket?.isConnected == true && address == addr) return
        close()
        val a = adapter ?: throw IOException("No Bluetooth")
        val device = a.getRemoteDevice(addr)
        try {
            a.cancelDiscovery() // a running scan slows connecting; needs a permission we don't ask for
        } catch (_: SecurityException) {
        }
        // The standard way first; some printers only take an unencrypted
        // link, or answer only on channel 1.
        val ways = listOf<() -> BluetoothSocket>(
            { device.createRfcommSocketToServiceRecord(spp) },
            { device.createInsecureRfcommSocketToServiceRecord(spp) },
            { device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1) as BluetoothSocket },
        )
        var last: Exception? = null
        for ((i, make) in ways.withIndex()) {
            var s: BluetoothSocket? = null
            val started = SystemClock.elapsedRealtime()
            try {
                s = make()
                s.connect()
                socket = s
                address = addr
                return
            } catch (e: Exception) {
                last = e
                try {
                    s?.close()
                } catch (_: Exception) {
                }
                // A slow failure means the printer is off or out of range —
                // the other ways would only time out too.
                if (i == 0 && SystemClock.elapsedRealtime() - started > 3000) break
            }
        }
        throw IOException(last?.message ?: "Couldn't connect")
    }
}
