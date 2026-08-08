import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  ChartBar,
  Check,
  CheckCircle,
  Fingerprint,
  Globe,
  Info,
  MagnifyingGlass,
  Question,
  ShieldCheck,
  Stamp,
  UserCircle,
  Users,
  Wallet,
  X,
} from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import type {
  EligibilityAttestation,
  PassportSession,
  PrivateState,
  VoteReveal,
} from "midnight-referendum-api";
import { PassportIdentityBridge, PassportBridgeError } from "@/integration/passport";
import { deriveProfileId } from "@/integration/profile";
import { useWallet } from "@/hooks/use-wallet";
import { MidnightProvidersProvider, useMidnightProviders } from "@/providers/midnight-providers";
import { WalletProvider } from "@/providers/wallet-context";

type Tab = "understand" | "votes" | "verify" | "profile";
type Choice = VoteReveal["choice"];
type FlowStage = "verify" | "eligible" | "choose" | "review" | "processing" | "receipt";

interface Poll {
  id: string;
  title: string;
  description: string;
  deadline: string;
  eligible: string;
}

interface VoteReceipt {
  id: string;
  pollId?: string;
  profileId?: string;
  choice: Choice;
  createdAt: string;
  status: "demo-confirmed" | "preview-confirmed";
  explorerUrl?: string;
}

const APP_MODE: "demo" | "preview" =
  import.meta.env.VITE_APP_MODE === "preview" ? "preview" : "demo";
const CONTRACT_ADDRESS = import.meta.env.VITE_MIDNIGHT_CONTRACT_ADDRESS?.trim() || null;
const PASSPORT_ORIGIN = import.meta.env.VITE_PASSPORT_ORIGIN?.trim() || "https://midnightpassport.com";
const EXPLORER_BASE_URL =
  import.meta.env.VITE_MIDNIGHT_EXPLORER_BASE_URL?.trim() ||
  "https://explorer.preview.midnight.network/tx";

const POLLS: Poll[] = [
  {
    id: "energia-renovable",
    title: "¿Querés priorizar energías renovables en tu comunidad?",
    description:
      "Esta propuesta busca que tu municipio destine más recursos a energías renovables locales y transición energética.",
    deadline: "7 de agosto de 2026",
    eligible: "85.432",
  },
  {
    id: "transporte-publico",
    title: "¿Querés mejorar el transporte público de tu ciudad?",
    description: "Una consulta ciudadana sobre frecuencias, accesibilidad y unidades de transporte público.",
    deadline: "21 de agosto de 2026",
    eligible: "81.120",
  },
];
const DEFAULT_POLL = POLLS[0]!;

function loadReceipts(): VoteReceipt[] {
  try {
    return JSON.parse(localStorage.getItem("referendum_civico_receipts") ?? "[]") as VoteReceipt[];
  } catch {
    return [];
  }
}

function Header({
  passportSession,
  passportError,
  onConnectPassport,
  onDismissPassportError,
}: {
  passportSession: PassportSession | null;
  passportError: string | null;
  onConnectPassport: () => void;
  onDismissPassportError: () => void;
}) {
  const { status, shieldedAddress, connect, disconnect } = useWallet();
  const { isReady } = useMidnightProviders();
  return (
    <header className="site-header">
      <div className="brand-lockup">
        <span className="flag-mark" role="img" aria-label="Argentina"><span /></span>
        <div><p className="brand-name">Referéndum Cívico</p><p className="brand-note">Prototipo independiente</p></div>
      </div>
      <div className="wallet-area">
        <button className={`wallet-chip ${passportSession ? "connected" : ""}`} onClick={onConnectPassport} title={passportError ?? "Identidad pública de Midnight Passport"} aria-label={passportSession ? "Abrir Midnight Passport" : "Conectar Midnight Passport"}>
          <Fingerprint size={14} weight="bold" /> <span>{passportSession?.displayName ?? "Passport"}</span>
        </button>
        {status === "connected" && shieldedAddress ? (
          <button className="wallet-chip connected" onClick={disconnect} title="Desconectar wallet" aria-label="Desconectar wallet"><span className="network-dot" /> <span>{isReady ? "Preview" : "Wallet"}</span></button>
        ) : <button className="wallet-chip" onClick={connect} aria-label="Conectar wallet"><Wallet size={14} weight="bold" /> <span>Wallet</span></button>}
        {passportError ? <div className="wallet-status-popover" role="alert"><button className="popover-close" onClick={onDismissPassportError} aria-label="Cerrar aviso"><X size={15} /></button><strong>No se pudo conectar Passport</strong><p>{passportError}</p><button className="popover-action" onClick={onConnectPassport}>Reintentar</button></div> : null}
      </div>
    </header>
  );
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const items = [
    { id: "understand" as const, label: "Entendé", Icon: BookOpen },
    { id: "votes" as const, label: "Votaciones", Icon: Stamp },
    { id: "verify" as const, label: "Verificá", Icon: ShieldCheck },
    { id: "profile" as const, label: "Mi perfil", Icon: UserCircle },
  ];
  return <nav className="bottom-nav" aria-label="Navegación principal">{items.map(({ id, label, Icon }) => <button key={id} className={`nav-item ${tab === id ? "active" : ""}`} onClick={() => onChange(id)} aria-current={tab === id ? "page" : undefined}><span className="nav-icon"><Icon size={22} weight={tab === id ? "fill" : "regular"} /></span><span>{label}</span></button>)}</nav>;
}

function StatusPill({ children }: { children: ReactNode }) {
  return <span className="status-pill"><span className="status-dot" />{children}</span>;
}

function CommitPhasePanel() {
  return <section className="results-panel" aria-labelledby="results-title"><div className="results-heading"><ChartBar size={22} /><div><h2 id="results-title">Compromiso privado durante la votación</h2><p>Las respuestas se revelan y agregan después del cierre.</p></div></div><div className="results-note"><ShieldCheck size={20} /><p>El contrato registra compromisos anónimos, nullifiers de un voto y publica solo el agregado YES/NO/ABSTAIN durante reveal.</p></div></section>;
}

function VotesView({ onStartVote }: { onStartVote: (pollId: string) => void }) {
  const [selectedId, setSelectedId] = useState(DEFAULT_POLL.id);
  const selectedPoll = POLLS.find((poll) => poll.id === selectedId) ?? DEFAULT_POLL;
  return <main className="page-content"><div className="page-heading"><div><p className="eyebrow">Participación ciudadana</p><h1>Votaciones en curso</h1></div><span className="open-count"><span className="status-dot" />{POLLS.length} abiertas</span></div><article className="poll-detail"><div className="poll-meta"><StatusPill>Votación abierta</StatusPill><span>Desde el 24 de mayo de 2026</span></div><h2>{selectedPoll.title}</h2><p className="poll-description">{selectedPoll.description}</p><button className="text-link" onClick={() => setSelectedId(selectedPoll.id)}><Info size={18} /> Leé la propuesta completa <ArrowRight size={16} /></button><div className="poll-stats"><div><Calendar size={20} /><span>Cierre de la votación<strong>{selectedPoll.deadline}</strong></span></div><div><Users size={20} /><span>Personas habilitadas<strong>{selectedPoll.eligible}</strong></span></div></div><button className="primary-button yellow" onClick={() => onStartVote(selectedPoll.id)}><Stamp size={22} /> Votá ahora</button></article><CommitPhasePanel /><section className="project-section" aria-labelledby="projects-title"><div className="section-title-row"><div><p className="eyebrow">Más consultas</p><h2 id="projects-title">Conocé cada propuesta</h2></div><Globe size={22} /></div><div className="project-list">{POLLS.map((poll) => <button key={poll.id} className={`project-row ${poll.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(poll.id)}><span className="project-row-icon"><Stamp size={20} /></span><span className="project-row-copy"><strong>{poll.title}</strong><small>{poll.deadline}</small></span><ArrowRight size={18} /></button>)}</div></section></main>;
}

function UnderstandView() {
  return <main className="page-content"><section className="welcome-panel"><div className="welcome-copy"><p className="eyebrow">Bienvenido/a</p><h1>Decidir en comunidad, con información clara.</h1><p>Aprendé cómo funciona un referéndum ciudadano verificable antes de elegir si querés votar.</p></div><img className="gaucho" src="/assets/gaucho-waving.png" alt="Ilustración de un gaucho saludando" /></section><section className="explain-panel"><div className="explain-icon"><Fingerprint size={24} /></div><div><h2>Tu decisión, tu comprobante</h2><p>Passport muestra tu identidad pública; el voto usa un secreto anónimo separado y el wallet solo aprueba la transacción.</p></div></section><section className="faq-section" aria-labelledby="faq-title"><div className="section-title-row"><div><p className="eyebrow">Preguntas frecuentes</p><h2 id="faq-title">Entendé la propuesta</h2></div><Question size={24} /></div><div className="faq-list"><details className="faq-item"><summary><span>¿Qué estamos construyendo?</span><ArrowRight size={18} /></summary><p>Un prototipo de participación ciudadana con onboarding Passport, elegibilidad desacoplada y contratos Midnight verificables.</p></details><details className="faq-item"><summary><span>¿El voto queda público?</span><ArrowRight size={18} /></summary><p>No durante commit: la elección y el salt permanecen privados. Solo reveal actualiza los agregados.</p></details><details className="faq-item"><summary><span>¿Es un referéndum oficial?</span><ArrowRight size={18} /></summary><p>No. Es un prototipo independiente para hackathon.</p></details></div></section><p className="independent-note"><Info size={16} /> Prototipo independiente para hackathon.</p></main>;
}

function VerifyView({ receipts }: { receipts: VoteReceipt[] }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<"found" | "missing" | null>(null);
  const matched = receipts.find((receipt) => receipt.id === query.trim());
  return <main className="page-content"><section className="verify-hero"><div className="verify-icon"><ShieldCheck size={32} /></div><p className="eyebrow">Transparencia pública</p><h1>Verificá un comprobante</h1><p>Buscá el identificador para consultar si fue confirmado.</p></section><form className="verify-form" onSubmit={(event) => { event.preventDefault(); setResult(matched ? "found" : "missing"); }}><label htmlFor="receipt-id">Identificador del comprobante</label><div className="search-control"><MagnifyingGlass size={20} /><input id="receipt-id" value={query} onChange={(event) => { setQuery(event.target.value); setResult(null); }} placeholder="demo-..." /><button type="submit" disabled={!query.trim()}>Buscar</button></div></form>{result === "found" && matched ? <section className="verify-result success" aria-live="polite"><CheckCircle size={28} /><div><strong>Comprobante confirmado</strong><p>Elección {matched.choice} registrada en {matched.status === "preview-confirmed" ? "Preview" : "modo demo"}.</p><code>{matched.id}</code>{matched.explorerUrl ? <a href={matched.explorerUrl} target="_blank" rel="noreferrer">Abrir en explorer</a> : null}</div></section> : null}{result === "missing" ? <section className="verify-result missing" aria-live="polite"><Info size={24} /><div><strong>No encontramos ese comprobante</strong><p>Revisá el identificador o esperá la confirmación.</p></div></section> : null}<section className="verify-explanation"><h2>¿Qué podés comprobar?</h2><ul><li><Check size={18} /> Que el comprobante existe.</li><li><Check size={18} /> Que tiene estado confirmado.</li><li><Check size={18} /> Que no necesitás compartir tus datos personales otra vez.</li></ul></section></main>;
}

function ProfileView({
  passportSession,
  profileId,
  receipts,
  walletStatus,
  onConnectPassport,
}: {
  passportSession: PassportSession | null;
  profileId: string;
  receipts: VoteReceipt[];
  walletStatus: string;
  onConnectPassport: () => void;
}) {
  return <main className="page-content"><section className="profile-hero"><div className="profile-avatar"><UserCircle size={34} weight="duotone" /></div><p className="eyebrow">Mi identidad</p><h1>{passportSession?.displayName ?? "Tu espacio ciudadano"}</h1><p>Un perfil para reunir tus comprobantes sin convertir tu identidad Passport en tu voto.</p>{passportSession ? <div className="profile-status"><CheckCircle size={17} /> Passport conectado</div> : <button className="secondary-button" onClick={onConnectPassport}><Fingerprint size={18} /> Conectar Passport</button>}</section><section className="profile-card" aria-labelledby="profile-id-title"><div className="profile-card-heading"><div><p className="eyebrow">Identificador de perfil</p><h2 id="profile-id-title">{profileId}</h2></div><ShieldCheck size={24} /></div><p>Es un identificador de presentación específico para esta app. No participa en la elegibilidad, el compromiso ni el nullifier anónimo.</p><div className="profile-connections"><span><Fingerprint size={17} /> Passport: {passportSession ? "conectado" : "pendiente"}</span><span><Wallet size={17} /> Wallet: {walletStatus === "connected" ? "conectada" : "no conectada"}</span></div></section><section className="profile-history" aria-labelledby="profile-history-title"><div className="section-title-row"><div><p className="eyebrow">Actividad local</p><h2 id="profile-history-title">Mis comprobantes</h2></div><span className="profile-count">{receipts.length}</span></div>{receipts.length ? <div className="profile-receipts">{receipts.map((receipt) => <article className="profile-receipt" key={receipt.id}><div><strong>{receipt.pollId ? POLLS.find((poll) => poll.id === receipt.pollId)?.title ?? "Consulta ciudadana" : "Consulta ciudadana"}</strong><small>{new Date(receipt.createdAt).toLocaleDateString("es-AR")} · {receipt.status === "preview-confirmed" ? "Confirmado en Preview" : "Comprobante local"}</small></div><div className="profile-receipt-actions"><code>{receipt.id}</code>{receipt.explorerUrl ? <a href={receipt.explorerUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ${receipt.id} en explorer`}><ArrowRight size={17} /></a> : null}</div></article>)}</div> : <div className="profile-empty"><p>Todavía no tenés comprobantes guardados en este navegador.</p><span>Cuando participes, aparecerán acá sin publicar tu elección.</span></div>}</section><section className="domains-card" aria-labelledby="domains-title"><div className="domains-icon"><Globe size={25} /></div><div><p className="eyebrow">Próximamente</p><h2 id="domains-title">Tu identidad .night</h2><p>Podés registrar un alias en Midnight Domains y usarlo como una identidad legible para tu perfil.</p><a className="text-link" href="https://midnight.domains/" target="_blank" rel="noreferrer">Explorar Midnight Domains <ArrowRight size={16} /></a><small>El registro y el pago requieren una wallet compatible y DUST; todavía no se ejecutan dentro de esta app.</small></div></section></main>;
}

function FlowStepper({ active }: { active: number }) {
  return <div className="flow-stepper">{["Entendé", "Verificá", "Votá"].map((step, index) => <div className={`flow-step ${index + 1 === active ? "current" : index + 1 < active ? "done" : ""}`} key={step}><span>{index + 1 < active ? <Check size={16} /> : index + 1}</span><small>{step}</small></div>)}</div>;
}

function VoteFlow({
  stage, choice, onChoice, onStage, onClose, onConfirm, onViewReceipt, walletStatus,
  passportSession, onConnectPassport, previewError, receipt,
}: {
  stage: FlowStage; choice: Choice | null; onChoice: (choice: Choice) => void; onStage: (stage: FlowStage) => void;
  onClose: () => void; onConfirm: () => void; onViewReceipt: () => void; walletStatus: string;
  passportSession: PassportSession | null; onConnectPassport: () => void; previewError: string | null; receipt: VoteReceipt | null;
}) {
  const activeStep = stage === "verify" || stage === "eligible" ? 2 : 3;
  return <main className="page-content flow-page"><button className="back-button" onClick={onClose}><ArrowLeft size={18} /> Volver a la propuesta</button><FlowStepper active={activeStep} />
    {stage === "verify" ? <section className="flow-card"><div className="flow-card-icon"><Fingerprint size={32} /></div><p className="eyebrow">Identidad y elegibilidad</p><h1>Antes de votar</h1><h2>Conectá Midnight Passport</h2><p>Passport aporta onboarding passkey y un perfil consentido. No comparte tu secreto de voto ni reemplaza la aprobación del wallet.</p>{passportSession ? <div className="data-summary"><span><CheckCircle size={18} /> Passport conectado{passportSession.displayName ? ` · ${passportSession.displayName}` : ""}</span><span><ShieldCheck size={18} /> Secreto anónimo separado</span></div> : <button className="secondary-button" onClick={onConnectPassport}><Fingerprint size={18} /> Conectar Passport</button>}<div className="trust-line"><ShieldCheck size={20} /><span>Una persona, un voto.</span></div><button className="primary-button yellow" disabled={APP_MODE === "preview" && !passportSession} onClick={() => onStage("eligible")}>Validar elegibilidad <ArrowRight size={20} /></button>{APP_MODE === "demo" && !passportSession ? <button className="secondary-link" onClick={() => onStage("eligible")}>Continuar con fixture demo <ArrowRight size={16} /></button> : null}</section> : null}
    {stage === "eligible" ? <section className="flow-card success-card"><div className="success-symbol"><Check size={34} /></div><p className="eyebrow">Fixture de hackathon</p><h1>Listo, podés votar</h1><p>La elegibilidad se convierte en un compromiso de membresía. No se almacenan documentos ni datos de KYC.</p><div className="data-summary"><span><CheckCircle size={18} /> Elegibilidad validada</span><span><ShieldCheck size={18} /> Datos personales no guardados</span></div><button className="primary-button blue" onClick={() => onStage("choose")}>Continuar al voto <ArrowRight size={20} /></button></section> : null}
    {stage === "choose" ? <section className="flow-card"><p className="eyebrow">Paso 3 de 3</p><h1>Elegí tu respuesta</h1><p>¿Querés priorizar energías renovables en tu comunidad?</p><div className="choice-list"><button className={`choice-button yes ${choice === "YES" ? "selected" : ""}`} onClick={() => onChoice("YES")}><span>Sí</span><small>Estoy de acuerdo</small><span className="choice-check">{choice === "YES" ? <Check size={18} /> : null}</span></button><button className={`choice-button no ${choice === "NO" ? "selected" : ""}`} onClick={() => onChoice("NO")}><span>No</span><small>No estoy de acuerdo</small><span className="choice-check">{choice === "NO" ? <Check size={18} /> : null}</span></button><button className={`choice-button ${choice === "ABSTAIN" ? "selected" : ""}`} onClick={() => onChoice("ABSTAIN")}><span>Abstención</span><small>Prefiero no elegir</small><span className="choice-check">{choice === "ABSTAIN" ? <Check size={18} /> : null}</span></button></div><button className="primary-button blue" disabled={!choice} onClick={() => onStage("review")}>Revisar mi voto <ArrowRight size={20} /></button></section> : null}
    {stage === "review" ? <section className="flow-card"><p className="eyebrow">Revisá antes de confirmar</p><h1>Tu compromiso</h1><div className={`review-choice ${choice === "NO" ? "no" : "yes"}`}><span>{choice}</span><small>La opción se mantiene privada hasta reveal.</small></div><div className="review-notice"><Info size={20} /><p>Identidad Passport: {passportSession ? "conectada" : "no conectada"}. Aprobación del wallet: {walletStatus === "connected" ? "lista" : "pendiente"}.</p></div>{previewError ? <div className="verify-result missing"><Info size={20} /><div><strong>Preview todavía no puede enviar</strong><p>{previewError}</p></div></div> : null}<button className="primary-button yellow" onClick={onConfirm}>Confirmar compromiso {APP_MODE === "preview" ? "en Preview" : "en demo"} <ArrowRight size={20} /></button></section> : null}
    {stage === "processing" ? <section className="flow-card processing-card"><div className="processing-spinner"><ChartBar size={34} /></div><p className="eyebrow">Procesando</p><h1>Preparando tu comprobante</h1><p>El flujo reúne prueba, balanceo DUST/NIGHT, aprobación del wallet y confirmación canónica.</p><div className="processing-track"><span /></div></section> : null}
    {stage === "receipt" ? <section className="flow-card success-card"><div className="success-symbol"><Check size={34} /></div><p className="eyebrow">Compromiso registrado</p><h1>Gracias por participar</h1><p>Guardá este identificador para verificar el resultado.</p><div className="receipt-box"><span>Comprobante</span><strong>{receipt?.id ?? "Disponible en Verificá"}</strong><small>{receipt?.status === "preview-confirmed" ? "Confirmado en Preview." : "Confirmado en modo demo."}</small></div>{receipt?.explorerUrl ? <a className="text-link" href={receipt.explorerUrl} target="_blank" rel="noreferrer">Abrir transacción en explorer <ArrowRight size={16} /></a> : null}<button className="primary-button blue" onClick={onViewReceipt}>Ver mi comprobante <ArrowRight size={20} /></button></section> : null}
  </main>;
}

function CivicApp() {
  const [tab, setTab] = useState<Tab>("votes");
  const [flowStage, setFlowStage] = useState<FlowStage | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [activePollId, setActivePollId] = useState(DEFAULT_POLL.id);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [receipts, setReceipts] = useState<VoteReceipt[]>(loadReceipts);
  const [passportSession, setPassportSession] = useState<PassportSession | null>(null);
  const [passportError, setPassportError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<{ attestation: EligibilityAttestation; voterSecret: Uint8Array } | null>(null);
  const { status: walletStatus } = useWallet();
  const { providers } = useMidnightProviders();
  const profileId = useMemo(() => deriveProfileId(passportSession), [passportSession]);
  const connectPassport = async () => {
    setPassportError(null);
    try {
      const session = await new PassportIdentityBridge({ passportOrigin: PASSPORT_ORIGIN }).connect(["displayName", "passportContract", "midnightAddresses"]);
      setPassportSession(session);
    } catch (error) {
      setPassportError(error instanceof PassportBridgeError ? error.message : "No se pudo conectar Passport");
    }
  };

  const startVote = async (pollId: string) => {
    setActivePollId(pollId); setChoice(null); setReceipt(null); setPreviewError(null); setFlowStage("verify");
    if (APP_MODE === "preview") {
      try {
        const { createFixtureEligibilityProvider } = await import("midnight-referendum-api");
        setEligibility(await createFixtureEligibilityProvider().attest(passportSession, pollId));
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : "No se pudo validar la elegibilidad");
      }
    }
  };

  const confirmVote = async () => {
    if (APP_MODE === "preview") {
      if (!walletStatus || walletStatus !== "connected") { setPreviewError("Conectá un wallet DApp Connector para aprobar y balancear la transacción."); return; }
      if (!providers || !CONTRACT_ADDRESS) { setPreviewError("Configurá VITE_MIDNIGHT_CONTRACT_ADDRESS y los assets ZK servidos en /managed/referendum."); return; }
      if (!eligibility || !choice) { setPreviewError("Completá la validación de elegibilidad antes de firmar."); return; }
      setPreviewError(null); setFlowStage("processing");
      try {
        const { createReferendumExecutor, findEligibilityPath } = await import("midnight-referendum-api");
        const voteSalt = crypto.getRandomValues(new Uint8Array(32));
        const voterPath = await findEligibilityPath(providers, CONTRACT_ADDRESS, eligibility.attestation.subjectCommitment);
        const privateState: PrivateState = { voterSecret: eligibility.voterSecret, voterChoice: choice, voteSalt, voterPath };
        const executor = createReferendumExecutor(providers, { issuerSecret: new Uint8Array(32), organizerSecret: new Uint8Array(32), eventId: new Uint8Array(32), explorerBaseUrl: EXPLORER_BASE_URL });
        await executor.join(CONTRACT_ADDRESS, privateState);
        const confirmed = await executor.castVote();
        const nextReceipt: VoteReceipt = { id: confirmed.txId, pollId: activePollId, profileId, choice, createdAt: new Date().toISOString(), status: "preview-confirmed", explorerUrl: confirmed.explorerUrl };
        const nextReceipts = [nextReceipt, ...receipts]; setReceipts(nextReceipts); localStorage.setItem("referendum_civico_receipts", JSON.stringify(nextReceipts)); setReceipt(nextReceipt); setFlowStage("receipt");
      } catch (error) { setPreviewError(error instanceof Error ? error.message : "Preview transaction failed"); setFlowStage("review"); }
      return;
    }
    setFlowStage("processing");
    window.setTimeout(() => { const nextReceipt: VoteReceipt = { id: `demo-${Date.now().toString(36)}`, pollId: activePollId, profileId, choice: choice ?? "ABSTAIN", createdAt: new Date().toISOString(), status: "demo-confirmed" }; const nextReceipts = [nextReceipt, ...receipts]; setReceipts(nextReceipts); localStorage.setItem("referendum_civico_receipts", JSON.stringify(nextReceipts)); setReceipt(nextReceipt); setFlowStage("receipt"); }, 650);
  };

  const currentTabContent = useMemo(() => tab === "understand" ? <UnderstandView /> : tab === "verify" ? <VerifyView receipts={receipts} /> : tab === "profile" ? <ProfileView passportSession={passportSession} profileId={profileId} receipts={receipts} walletStatus={walletStatus} onConnectPassport={() => void connectPassport()} /> : <VotesView onStartVote={startVote} />, [passportSession, profileId, receipts, tab, walletStatus]);
  const navigate = (nextTab: Tab) => { setTab(nextTab); setFlowStage(null); };
  return <div className="app-shell"><Header passportSession={passportSession} passportError={passportError} onConnectPassport={() => void connectPassport()} onDismissPassportError={() => setPassportError(null)} /><div className="mode-strip"><div className="mode-copy"><span><span className="status-dot" />{APP_MODE === "preview" ? (CONTRACT_ADDRESS ? "Preview configurado" : "Preview requiere configuración") : "Prototipo local"}</span><span className="mode-help">{passportSession ? "Passport conectado · wallet separado" : APP_MODE === "preview" ? "Wallet DApp Connector para votar" : "Explorá sin wallet"}</span></div><details className="mode-details"><summary aria-label="Qué significa este estado"><Info size={14} /><span>Info</span></summary><p>{APP_MODE === "preview" ? "Preview prepara transacciones reales cuando el contrato, los assets y la wallet están configurados." : "Esta vista permite explorar el flujo sin enviar transacciones a la red."}</p></details></div>{flowStage ? <VoteFlow stage={flowStage} choice={choice} onChoice={setChoice} onStage={setFlowStage} onClose={() => setFlowStage(null)} onConfirm={() => void confirmVote()} onViewReceipt={() => { setFlowStage(null); setTab("verify"); }} walletStatus={walletStatus} passportSession={passportSession} onConnectPassport={() => void connectPassport()} previewError={previewError} receipt={receipt} /> : currentTabContent}<BottomNav tab={tab} onChange={navigate} />{receipt ? <button className="receipt-toast" onClick={() => { setFlowStage(null); setTab("verify"); }}><CheckCircle size={18} /> Último comprobante listo <ArrowRight size={16} /></button> : null}</div>;
}

export function App() {
  return <WalletProvider><MidnightProvidersProvider><CivicApp /></MidnightProvidersProvider></WalletProvider>;
}
