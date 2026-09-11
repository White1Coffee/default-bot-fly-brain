package com.fruitfly.brain.tools;

import com.fruitfly.brain.Connectome;
import com.fruitfly.brain.LifConfig;
import com.fruitfly.brain.LifNetwork;
import com.fruitfly.brain.MotorDecoder;
import com.fruitfly.brain.PopulationIndex;
import com.fruitfly.brain.RetinaGeometry;
import com.fruitfly.brain.SensoryEncoders;
import com.fruitfly.brain.SensoryFrame;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Project-owned stdin/stdout bridge for Node/Mineflayer.
 *
 * Tick pipeline per line:
 * SensoryFrame fill -> SensoryEncoders.apply -> LifNetwork.runMs(50) -> MotorDecoder.update -> LifNetwork.endTick(50).
 */
public final class FlyBrainBridge {
    private static final double TICK_MS = 50.0;

    public static void main(String[] args) throws Exception {
        Map<String, String> a = argsMap(args);
        String flyb = a.getOrDefault("flyb", "external/fly-brain-minecraft/src/main/resources/connectome/malecns-v1.0.flyb.gz");

        LifConfig cfg = new LifConfig();
        cfg.dtMs = Double.parseDouble(a.getOrDefault("dt", "0.5"));
        cfg.gain = Double.parseDouble(a.getOrDefault("gain", "0.65"));
        cfg.threads = Integer.parseInt(a.getOrDefault("threads", "0"));
        cfg.parallelThreshold = Integer.parseInt(a.getOrDefault("parallelThreshold", "4000"));

        Connectome connectome;
        try (InputStream in = new FileInputStream(flyb)) {
            connectome = Connectome.load(in);
        }

        PopulationIndex populations = new PopulationIndex(connectome);
        RetinaGeometry geometry = new RetinaGeometry(connectome);
        LifNetwork network = new LifNetwork(connectome, cfg);
        SensoryEncoders encoders = new SensoryEncoders(connectome, populations, geometry, new SensoryEncoders.Params());
        MotorDecoder decoder = new MotorDecoder(populations);
        SensoryFrame frame = new SensoryFrame();
        frame.luminance = new float[geometry.columnCount()];

        System.out.println("{\"ready\":true,\"tickMs\":" + (int) TICK_MS + ",\"retinaColumns\":" + geometry.columnCount() + "}");
        System.out.flush();

        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        long tick = 0;
        while ((line = reader.readLine()) != null) {
            if (line.isBlank()) continue;
            tick++;
            try {
                Map<String, String> values = parseLine(line);
                frame.clear();
                if (frame.luminance.length != geometry.columnCount()) frame.luminance = new float[geometry.columnCount()];
                fillRetina(frame, values.get("retina"), geometry.columnCount(), parseFloat(values.get("ambient"), 0.6f));
                frame.damage = parseFloat(values.get("damage"), 0);
                frame.windLeft = parseFloat(values.get("windLeft"), 0);
                frame.windRight = parseFloat(values.get("windRight"), 0);
                frame.touchHead = parseFloat(values.get("touchHead"), 0);
                frame.touchWing = parseFloat(values.get("touchWing"), 0);
                frame.touchLegs = parseFloat(values.get("touchLegs"), 0);
                frame.touchNotum = parseFloat(values.get("touchNotum"), 0);
                frame.touchAbdomen = parseFloat(values.get("touchAbdomen"), 0);
                frame.groomDust = parseFloat(values.get("groomDust"), 0);
                frame.airborne = Boolean.parseBoolean(values.getOrDefault("airborne", "false"));
                frame.legsOnGround = Boolean.parseBoolean(values.getOrDefault("legsOnGround", frame.airborne ? "false" : "true"));
                frame.wingbeat = parseFloat(values.get("wingbeat"), 0);
                frame.tilt = parseFloat(values.get("tilt"), 0);
                frame.soundLow = parseFloat(values.get("soundLow"), 0);
                frame.soundHigh = parseFloat(values.get("soundHigh"), 0);
                frame.song = parseFloat(values.get("song"), 0);
                frame.yawRateDegPerS = parseFloat(values.get("yawRate"), 0);
                frame.pitchRateDegPerS = parseFloat(values.get("pitchRate"), 0);
                frame.rollRateDegPerS = parseFloat(values.get("rollRate"), 0);
                frame.odorBearingDeg = parseFloat(values.get("odorBearing"), Float.NaN);
                applyOdors(frame, values.get("odor"));
                applyTastes(frame, values.get("taste"));
                applyObjects(frame, values.get("objects"));

                long start = System.nanoTime();
                encoders.apply(frame, network, TICK_MS);
                network.runMs(TICK_MS);
                MotorDecoder.MotorCommand command = decoder.update(network, TICK_MS);
                long wallMicros = Math.max(0, (System.nanoTime() - start) / 1000);
                System.out.println(toJson(command, network, tick, wallMicros));
                System.out.flush();
                network.endTick(TICK_MS);
            } catch (Exception err) {
                System.out.println("{\"error\":\"" + esc(err.getMessage()) + "\"}");
                System.out.flush();
            }
        }
    }

    private static void fillRetina(SensoryFrame frame, String encoded, int columns, float ambient) {
        for (int i = 0; i < columns; i++) frame.luminance[i] = ambient;
        if (encoded == null || encoded.isBlank()) return;
        String[] samples = encoded.split(",");
        if (samples.length == 0) return;
        for (int i = 0; i < columns; i++) {
            int source = Math.min(samples.length - 1, (int) Math.floor((i / (double) Math.max(1, columns)) * samples.length));
            frame.luminance[i] = parseFloat(samples[source], ambient);
        }
    }

    private static Map<String, String> argsMap(String[] args) {
        Map<String, String> out = new HashMap<>();
        for (int i = 0; i + 1 < args.length; i += 2) out.put(args[i].replaceFirst("^--", ""), args[i + 1]);
        return out;
    }

    private static Map<String, String> parseLine(String line) {
        Map<String, String> out = new HashMap<>();
        for (String entry : line.split(";")) {
            int split = entry.indexOf('=');
            if (split <= 0) continue;
            out.put(entry.substring(0, split).trim(), entry.substring(split + 1).trim());
        }
        return out;
    }

    private static void applyOdors(SensoryFrame frame, String encoded) {
        if (encoded == null || encoded.isBlank()) return;
        for (String part : encoded.split(",")) {
            String[] p = part.split(":");
            if (p.length == 2) frame.addOdor(p[0], parseFloat(p[1], 0));
        }
    }

    private static void applyTastes(SensoryFrame frame, String encoded) {
        if (encoded == null || encoded.isBlank()) return;
        for (String part : encoded.split(",")) {
            String[] p = part.split(":");
            if (p.length == 2) frame.addTaste(p[0], parseFloat(p[1], 0));
        }
    }

    private static void applyObjects(SensoryFrame frame, String encoded) {
        if (encoded == null || encoded.isBlank()) return;
        for (String item : encoded.split("\\|")) {
            String[] p = item.split(",");
            if (p.length < 6) continue;
            SensoryFrame.VisualObject object = new SensoryFrame.VisualObject(
                    parseFloat(p[0], 0),
                    parseFloat(p[1], 0),
                    parseFloat(p[2], 0),
                    parseFloat(p[3], 0),
                    parseFloat(p[4], 0),
                    Boolean.parseBoolean(p[5])
            );
            if (p.length >= 7) object.contrast = parseFloat(p[6], 1);
            frame.objects.add(object);
        }
    }

    private static float parseFloat(String value, float fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return Float.parseFloat(value);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String toJson(MotorDecoder.MotorCommand command, LifNetwork network, long tick, long wallMicros) {
        double wallMs = wallMicros / 1000.0;
        double realtimeFactor = wallMs <= 0.0 ? 999.0 : TICK_MS / wallMs;
        return String.format(Locale.ROOT,
                "{\"tick\":%d,\"tickMs\":%.1f,\"simMs\":%.1f,\"wallMs\":%.3f,\"realtimeFactor\":%.3f,\"mode\":\"%s\",\"forward\":%.4f,\"yaw\":%.4f,\"backward\":%.4f,\"stop\":%.4f,\"jump\":%s,\"landing\":%.4f,\"flightPower\":%.4f,\"flightYaw\":%.4f,\"wingMotor\":%.4f,\"feed\":%.4f,\"groom\":%.4f,\"groomAntenna\":%.4f,\"groomHead\":%.4f,\"groomLeg\":%.4f,\"groomAbdomen\":%.4f,\"courtship\":%.4f,\"song\":%.4f,\"songPulse\":%.4f,\"legMotor\":%.4f,\"legMotorAsym\":%.4f,\"spikes\":%d,\"active\":%d}",
                tick,
                TICK_MS,
                TICK_MS,
                wallMs,
                realtimeFactor,
                command.mode,
                command.forward,
                command.yaw,
                command.backward,
                command.stop,
                command.jump ? "true" : "false",
                command.landing,
                command.flightPower,
                command.flightYaw,
                command.wingMotor,
                command.feed,
                command.groom(),
                command.groomAntenna,
                command.groomHead,
                command.groomLeg,
                command.groomAbdomen,
                command.courtship,
                command.song,
                command.songPulse,
                command.legMotor,
                command.legMotorAsym,
                network.totalSpikes(),
                network.activeNeurons());
    }

    private static String esc(String value) {
        return String.valueOf(value).replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
