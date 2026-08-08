import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, IdentificationCard, Info, ShieldCheck, X } from "@phosphor-icons/react";
import {
  checkDniEligibility,
  parseDniBarcode,
  summariseDni,
  uniquenessTag,
  MINIMUM_VOTING_AGE,
  type DniSummary,
} from "@/integration/dni";
import {
  createLivenessScript,
  evaluateStep,
  livenessFailureCopy,
  motionEnergy,
  PROMPT_COPY,
  type LivenessSample,
  type LivenessStep,
} from "@/integration/liveness";
import { createPdf417Decoder, type Pdf417Decoder } from "@/integration/pdf417";

/**
 * The only thing this component hands upward. The parsed document stays inside
 * the component and is dropped when it unmounts: nothing above this boundary
 * can leak a name or a document number, because nothing above it ever sees one.
 */
export interface DniVerificationResult {
  summary: DniSummary;
  uniquenessTag: string;
  livenessPassed: boolean;
  source: "document" | "demo";
}

type Phase = "intro" | "scanning" | "liveness" | "done" | "unsupported";

/** Synthetic payload for judges without an Argentine DNI. Never a real number. */
const DEMO_PAYLOAD = "00000000000@DEMOSTRACION@INVITADA@F@30000001@A@01/01/1990@01/01/2020@000";

const SAMPLE_INTERVAL_MS = 100;
/** One prompt, not two: eight seconds of silence is a long time on a stage. */
const LIVENESS_STEPS = 1;
/** Poor light must not trap someone in an unbounded retry loop. */
const MAX_LIVENESS_FAILURES = 2;

export function DniVerification({
  eventSalt,
  onVerified,
  onCancel,
}: {
  eventSalt: string;
  onVerified: (result: DniVerificationResult) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Pdf417Decoder | null>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [script, setScript] = useState<LivenessStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [livenessExhausted, setLivenessExhausted] = useState(false);
  const failuresRef = useRef(0);
  const pendingRef = useRef<{ summary: DniSummary; tag: string; source: "document" | "demo" } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // A camera left running after the step is a privacy problem in its own right.
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async (facingMode: "environment" | "user") => {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }, [stopCamera]);

  const grabFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, []);

  const acceptDocument = useCallback(
    async (payload: string, source: "document" | "demo") => {
      const parsed = parseDniBarcode(payload);
      if (!parsed.ok) {
        setHint("No pudimos leer el código. Acercá el dorso del DNI y evitá reflejos.");
        return false;
      }
      const decision = checkDniEligibility(parsed.document);
      if (!decision.eligible) {
        stopCamera();
        setError(
          decision.reason === "under-age"
            ? `Para participar necesitás tener ${MINIMUM_VOTING_AGE} años o más.`
            : "La fecha de emisión del documento no es válida.",
        );
        setPhase("intro");
        return false;
      }
      const summary = summariseDni(parsed.document);
      if (!summary) return false;
      // The tag is the only document-derived value that may leave the device.
      const pending = {
        summary,
        tag: await uniquenessTag(parsed.document, eventSalt),
        source,
      };
      pendingRef.current = pending;

      // The demo document exists for people who have no Argentine DNI to hand,
      // and it must not then demand a working camera to get past a presence
      // check — that turns the fallback into a second dead end. It reports
      // livenessPassed: false, because no presence was actually checked.
      if (source === "demo") {
        stopCamera();
        setPhase("done");
        onVerified({
          summary: pending.summary,
          uniquenessTag: pending.tag,
          livenessPassed: false,
          source: "demo",
        });
        return true;
      }

      failuresRef.current = 0;
      setLivenessExhausted(false);
      setScript(createLivenessScript(LIVENESS_STEPS));
      setStepIndex(0);
      setHint(null);
      setPhase("liveness");
      await startCamera("user");
      return true;
    },
    [eventSalt, onVerified, startCamera, stopCamera],
  );

  const beginScan = useCallback(async () => {
    setError(null);
    setHint(null);
    try {
      decoderRef.current ??= await createPdf417Decoder();
    } catch {
      setPhase("unsupported");
      return;
    }
    try {
      setPhase("scanning");
      await startCamera("environment");
    } catch {
      stopCamera();
      setError("No pudimos acceder a la cámara. Revisá los permisos del navegador.");
      setPhase("intro");
    }
  }, [startCamera, stopCamera]);

  // Scanning loop: read frames until a payload parses.
  useEffect(() => {
    if (phase !== "scanning") return;
    let active = true;
    const timer = window.setInterval(async () => {
      if (!active) return;
      const canvas = grabFrame();
      const decoder = decoderRef.current;
      if (!canvas || !decoder) return;
      const payload = await decoder.decode(canvas);
      if (payload && active) {
        active = false;
        window.clearInterval(timer);
        await acceptDocument(payload, "document");
      }
    }, 250);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [phase, grabFrame, acceptDocument]);

  // Liveness loop: score one prompt at a time from frame-to-frame motion.
  useEffect(() => {
    if (phase !== "liveness" || script.length === 0 || livenessExhausted) return;
    const step = script[stepIndex];
    if (!step) return;

    let previous: Uint8ClampedArray | null = null;
    const samples: LivenessSample[] = [];
    const startedAt = performance.now();
    let active = true;

    const timer = window.setInterval(() => {
      if (!active) return;
      const canvas = grabFrame();
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const frame = context.getImageData(0, 0, canvas.width, canvas.height).data;
      if (previous) {
        samples.push({ at: performance.now() - startedAt, energy: motionEnergy(previous, frame) });
      }
      previous = frame;

      if (performance.now() - startedAt < step.windowMs) return;
      active = false;
      window.clearInterval(timer);

      const verdict = evaluateStep(samples, step);
      if (verdict !== "passed") {
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_LIVENESS_FAILURES) {
          // A camera that cannot see the gesture will never see it. Offering a
          // way out beats trapping someone in a loop with only a close button.
          setHint(null);
          setLivenessExhausted(true);
          return;
        }
        setHint(livenessFailureCopy(verdict));
        setScript(createLivenessScript(LIVENESS_STEPS));
        setStepIndex(0);
        return;
      }
      if (stepIndex + 1 < script.length) {
        setHint(null);
        setStepIndex(stepIndex + 1);
        return;
      }

      // Frames are discarded here; only the pass/fail and the tag survive.
      stopCamera();
      const pending = pendingRef.current;
      if (!pending) return;
      setPhase("done");
      onVerified({
        summary: pending.summary,
        uniquenessTag: pending.tag,
        livenessPassed: true,
        source: pending.source,
      });
    }, SAMPLE_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [phase, script, stepIndex, livenessExhausted, grabFrame, stopCamera, onVerified]);

  /** Escape hatch after repeated failures; records that presence was not proved. */
  const continueWithoutPresence = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    stopCamera();
    setPhase("done");
    onVerified({
      summary: pending.summary,
      uniquenessTag: pending.tag,
      livenessPassed: false,
      source: pending.source,
    });
  }, [onVerified, stopCamera]);

  const retryLiveness = useCallback(() => {
    failuresRef.current = 0;
    setLivenessExhausted(false);
    setHint(null);
    setScript(createLivenessScript(LIVENESS_STEPS));
    setStepIndex(0);
  }, []);

  const useDemoDocument = useCallback(async () => {
    setError(null);
    try {
      await acceptDocument(DEMO_PAYLOAD, "demo");
    } catch {
      setError("No pudimos iniciar la verificación de presencia.");
    }
  }, [acceptDocument]);

  return (
    <section className="flow-card dni-card">
      <button className="dni-close" onClick={() => { stopCamera(); onCancel(); }} aria-label="Cancelar verificación">
        <X size={18} />
      </button>

      {phase === "intro" ? (
        <>
          <div className="flow-card-icon"><IdentificationCard size={32} /></div>
          <p className="eyebrow">Verificación de elegibilidad</p>
          <h1>Escaneá el dorso de tu DNI</h1>
          <p>
            Leemos el código de barras del dorso en tu dispositivo para comprobar que tenés{" "}
            {MINIMUM_VOTING_AGE} años o más y que este documento no votó antes.
          </p>
          <div className="data-summary">
            <span><ShieldCheck size={18} /> El documento no sale de tu teléfono</span>
            <span><ShieldCheck size={18} /> No guardamos fotos ni tu número</span>
          </div>
          {error ? <div className="verify-result missing" role="alert"><Info size={20} /><div><p>{error}</p></div></div> : null}
          <button className="primary-button yellow" onClick={() => void beginScan()}>
            <Camera size={22} /> Activar la cámara
          </button>
          <button className="secondary-link" onClick={() => void useDemoDocument()}>
            Usar documento de demostración <ArrowRight size={16} />
          </button>
        </>
      ) : null}

      {phase === "unsupported" ? (
        <>
          <div className="flow-card-icon"><Info size={32} /></div>
          <p className="eyebrow">Verificación de elegibilidad</p>
          <h1>Este navegador no puede leer el código</h1>
          <p>Probá con Chrome en Android o en escritorio, o seguí con el documento de demostración.</p>
          <button className="primary-button blue" onClick={() => void useDemoDocument()}>
            Usar documento de demostración <ArrowRight size={20} />
          </button>
        </>
      ) : null}

      {phase === "liveness" && livenessExhausted ? (
        <>
          <div className="flow-card-icon"><Info size={32} /></div>
          <p className="eyebrow">Paso 2 de 2 · Presencia</p>
          <h1>No pudimos leer el gesto</h1>
          <p>
            Puede ser la luz o la cámara. Podés intentarlo otra vez, o seguir sin la
            comprobación de presencia: tu documento ya fue verificado y quedará registrado
            que este paso no se completó.
          </p>
          <button className="primary-button blue" onClick={retryLiveness}>
            Intentar de nuevo <ArrowRight size={20} />
          </button>
          <button className="secondary-link" onClick={continueWithoutPresence}>
            Continuar sin comprobar presencia <ArrowRight size={16} />
          </button>
        </>
      ) : null}

      {phase === "scanning" || (phase === "liveness" && !livenessExhausted) ? (
        <>
          <p className="eyebrow">
            {phase === "scanning" ? "Paso 1 de 2 · Documento" : "Paso 2 de 2 · Presencia"}
          </p>
          <h1>
            {phase === "scanning"
              ? "Mostrá el dorso del DNI"
              : PROMPT_COPY[script[stepIndex]?.prompt ?? "nod"]}
          </h1>
          <div className={`dni-viewfinder ${phase === "liveness" ? "selfie" : ""}`}>
            <video ref={videoRef} playsInline muted aria-label="Vista de la cámara" />
            <span className="dni-frame" aria-hidden="true" />
          </div>
          {phase === "liveness" ? (
            <div className="liveness-progress" aria-live="polite">
              {script.map((step, index) => (
                <span key={step.prompt} className={index < stepIndex ? "done" : index === stepIndex ? "current" : ""}>
                  {index < stepIndex ? <Check size={14} /> : index + 1}
                </span>
              ))}
            </div>
          ) : null}
          {hint ? <p className="dni-hint" role="status">{hint}</p> : null}
          <p className="dni-disclaimer">
            <Info size={14} /> Esto comprueba que hay una persona presente. No es un cotejo
            biométrico ni valida el chip del documento.
          </p>
        </>
      ) : null}

      <canvas ref={canvasRef} className="dni-canvas" aria-hidden="true" />
    </section>
  );
}
