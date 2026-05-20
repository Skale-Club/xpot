import { useRef, useState, useEffect, useCallback } from "react";
import {
  Headphones,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from '@/components/ui/loader';

const MAX_SECONDS = 300;
const BAR_COUNT = 24;

export function VoiceRecorder({
  onUpload,
  existingAudio,
  existingDuration,
  existingTranscription,
}: {
  onUpload: (args: { audioBlob: Blob; durationSeconds: number }) => Promise<void>;
  existingAudio?: string | null;
  existingDuration?: number | null;
  existingTranscription?: string | null;
}) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Live waveform loop using AnalyserNode
  const drawLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    // Map frequency bins into BAR_COUNT buckets
    const bucketSize = Math.floor(data.length / BAR_COUNT);
    const next = Array.from({ length: BAR_COUNT }, (_, i) => {
      let sum = 0;
      for (let j = 0; j < bucketSize; j++) sum += data[i * bucketSize + j];
      return sum / bucketSize / 255; // 0–1
    });
    setBars(next);
    animFrameRef.current = requestAnimationFrame(drawLoop);
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Web Audio for live levels
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;
      animFrameRef.current = requestAnimationFrame(drawLoop);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      intervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_SECONDS - 1) { stopRecording(); return prev; }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  }

  function stopRecording() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); }
    setIsRecording(false);
    setBars(Array(BAR_COUNT).fill(0));
  }

  // Cleanup on unmount
  useEffect(() => () => { stopRecording(); }, []);

  async function handleUpload() {
    if (!audioBlob) return;
    setIsUploading(true);
    try {
      await onUpload({ audioBlob, durationSeconds: recordingTime });
      setAudioBlob(null);
      setRecordingTime(0);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  const timeDisplay = `${Math.floor(recordingTime / 60)}:${String(recordingTime % 60).padStart(2, "0")}`;
  const progress = Math.min(100, (recordingTime / MAX_SECONDS) * 100);

  return (
    <div className="space-y-3">
      {/* Existing audio playback */}
      {existingAudio ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl p-2" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Headphones className="h-4 w-4 shrink-0 text-indigo-400" />
            <audio src={existingAudio} controls className="h-8 w-full min-w-0" />
            {existingDuration ? <span className="shrink-0 text-xs text-white/40">{existingDuration}s</span> : null}
          </div>
          {existingTranscription ? (
            <div className="rounded-xl p-3 text-sm text-white/60" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70">Transcription</div>
              {existingTranscription}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Recorder row */}
      <div className="flex items-center gap-3">
        {/* Record / stop button */}
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all"
          style={{
            background: isRecording ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)",
            border: `1px solid ${isRecording ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.12)"}`,
            boxShadow: isRecording ? "0 0 16px rgba(239,68,68,0.25)" : "none",
          }}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isUploading}
        >
          {isRecording
            ? <div className="h-3 w-3 rounded-sm bg-red-400" />
            : <div className="h-3 w-3 rounded-full bg-white/60" />}
        </button>

        {/* State feedback */}
        <div className="flex-1 min-w-0">
          {isRecording ? (
            <div className="flex items-center gap-2.5">
              {/* Live waveform bars */}
              <div className="flex items-center gap-[2px] h-7 flex-1">
                {bars.map((level, i) => (
                  <div
                    key={i}
                    className="rounded-full flex-1"
                    style={{
                      height: `${Math.max(8, level * 100)}%`,
                      background: level > 0.6
                        ? "#f87171"
                        : level > 0.3
                          ? "#fb923c"
                          : "rgba(239,68,68,0.4)",
                      transition: "height 80ms ease-out",
                    }}
                  />
                ))}
              </div>
              <span className="text-xs font-mono text-white/50 tabular-nums shrink-0">{timeDisplay}</span>
            </div>
          ) : audioBlob ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-indigo-400 flex-1">Recorded ({recordingTime}s)</span>
              <button
                type="button"
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
                onClick={() => { setAudioBlob(null); setRecordingTime(0); }}
              >
                Clear
              </button>
            </div>
          ) : (
            <span className="text-sm text-white/30">
              {existingAudio ? "Re-record voice note" : "Tap to record voice notes"}
            </span>
          )}
        </div>

        {/* Upload button */}
        {audioBlob && !isRecording && (
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="rounded-xl px-3 py-1.5 text-sm font-medium text-white transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
          >
            {isUploading ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Upload"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isRecording && (
        <div className="space-y-1">
          <div className="h-0.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #f87171, #ef4444)" }}
            />
          </div>
          <div className="text-right text-[10px] text-white/25">{MAX_SECONDS - recordingTime}s left</div>
        </div>
      )}
    </div>
  );
}
