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
  Users,
  Stamp,
  Wallet,
} from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { useMidnightProviders } from "@/providers/midnight-providers";
import { WalletProvider } from "@/providers/wallet-context";
import { useWallet } from "@/hooks/use-wallet";
import { MidnightProvidersProvider } from "@/providers/midnight-providers";

type Tab = "understand" | "votes" | "verify";
type Choice = "YES" | "NO";
type FlowStage = "verify" | "eligible" | "choose" | "review" | "processing" | "receipt";

interface Poll {
  id: string;
  status: string;
  starts: string;
  title: string;
  description: string;
  deadline: string;
  eligible: string;
  yes: number;
  no: number;
}

interface VoteReceipt {
  id: string;
  choice: Choice;
  createdAt: string;
  status: "demo-confirmed";
}

const APP_MODE: "demo" | "preview" =
  import.meta.env.VITE_APP_MODE === "preview" ? "preview" : "demo";
const CONTRACT_ADDRESS = import.meta.env.VITE_MIDNIGHT_CONTRACT_ADDRESS?.trim() || null;

const POLLS: Poll[] = [
  {
    id: "energia-renovable",
    status: "Votación abierta",
    starts: "Desde el 24 de mayo de 2026",
    title: "¿Querés priorizar energías renovables en tu comunidad?",
    description:
      "Esta propuesta busca que tu municipio destine más recursos a energías renovables locales y transición energética, para reducir la contaminación, generar empleo verde y bajar costos a largo plazo.",
    deadline: "7 de agosto de 2026",
    eligible: "85.432",
    yes: 6318,
    no: 1594,
  },
  {
    id: "transporte-publico",
    status: "Votación abierta",
    starts: "Desde el 1 de junio de 2026",
    title: "¿Querés mejorar el transporte público de tu ciudad?",
    description:
      "Una consulta ciudadana sobre frecuencias, accesibilidad y unidades de transporte público.",
    deadline: "21 de agosto de 2026",
    eligible: "81.120",
    yes: 4520,
    no: 1880,
  },
  {
    id: "espacios-verdes",
    status: "Votación abierta",
    starts: "Desde el 10 de junio de 2026",
    title: "¿Querés más espacios verdes para nuestra ciudad?",
    description:
      "Decidí cómo priorizar la creación y el cuidado de plazas y corredores verdes.",
    deadline: "4 de septiembre de 2026",
    eligible: "79.814",
    yes: 5120,
    no: 940,
  },
];

const DEFAULT_POLL = POLLS[0]!;

const FAQS = [
  {
    question: "¿Qué estamos construyendo?",
    answer:
      "Referéndum Cívico es un prototipo para consultar decisiones de interés común con una experiencia simple, verificable y centrada en la ciudadanía.",
  },
  {
    question: "¿En qué se diferencia de una encuesta?",
    answer:
      "Una encuesta suele depender de una base de datos central. Acá cada voto confirmado deja una huella verificable en Midnight y el resultado se puede contrastar públicamente.",
  },
  {
    question: "¿En qué se diferencia de una petición?",
    answer:
      "Una petición reúne apoyos, pero no necesariamente controla que una misma persona no participe varias veces. El contrato usa compromisos y nullifiers para evitar el doble voto.",
  },
  {
    question: "¿Cómo usa tecnología blockchain?",
    answer:
      "Midnight aporta contratos verificables y pruebas de conocimiento cero para validar condiciones sin exponer más información de la necesaria. Esta demo todavía usa un tally público.",
  },
  {
    question: "¿Una persona puede votar más de una vez?",
    answer:
      "El contrato actual registra un nullifier por voto y rechaza un segundo uso del mismo comprobante de elegibilidad.",
  },
  {
    question: "¿Puedo verificar que mi voto fue contado?",
    answer:
      "Sí. Después de votar recibís un identificador de comprobante. La sección Verificá permite consultar su estado, sin pedirte que vuelvas a revelar tu identidad.",
  },
  {
    question: "¿Es un referéndum oficial del Estado?",
    answer:
      "No. Es un prototipo independiente para hackathon, inspirado en patrones de servicio público y participación ciudadana.",
  },
  {
    question: "¿Tengo que verificarme para leer la información?",
    answer:
      "No. Podés leer la propuesta, consultar los resultados preliminares y aprender cómo funciona sin conectar una wallet ni iniciar la verificación. Solo se solicita al elegir Votá.",
  },
];

function formatPercent(value: number, total: number): string {
  if (!total) return "0,0%";
  return `${((value / total) * 100).toFixed(1).replace(".", ",")}%`;
}

function loadReceipts(): VoteReceipt[] {
  try {
    return JSON.parse(localStorage.getItem("referendum_civico_receipts") ?? "[]") as VoteReceipt[];
  } catch {
    return [];
  }
}

function Header() {
  const { status, shieldedAddress, connect, disconnect } = useWallet();
  const { isReady } = useMidnightProviders();

  return (
    <header className="site-header">
      <div className="brand-lockup">
        <img className="flag-ribbon" src="/assets/argentina-flag-ribbon.png" alt="Detalle de la bandera argentina" />
        <div>
          <p className="brand-name">Referéndum Cívico</p>
          <p className="brand-note">Prototipo independiente</p>
        </div>
      </div>
      <div className="wallet-area">
        {status === "connected" && shieldedAddress ? (
          <button className="wallet-chip connected" onClick={disconnect} title="Desconectar wallet">
            <span className="network-dot" />
            {isReady ? "Preview listo" : "Wallet conectada"}
          </button>
        ) : (
          <button className="wallet-chip" onClick={connect}>
            <Wallet size={15} weight="bold" />
            Conectar wallet
          </button>
        )}
      </div>
    </header>
  );
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const items = [
    { id: "understand" as const, label: "Entendé", Icon: BookOpen },
    { id: "votes" as const, label: "Votaciones", Icon: Stamp },
    { id: "verify" as const, label: "Verificá", Icon: ShieldCheck },
  ];

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-item ${tab === id ? "active" : ""}`}
          onClick={() => onChange(id)}
          aria-current={tab === id ? "page" : undefined}
        >
          <span className="nav-icon"><Icon size={22} weight={tab === id ? "fill" : "regular"} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function StatusPill({ children }: { children: ReactNode }) {
  return <span className="status-pill"><span className="status-dot" />{children}</span>;
}

function ResultsChart({ poll }: { poll: Poll }) {
  const total = poll.yes + poll.no;
  const results = [
    { label: "Sí", count: poll.yes, color: "blue" },
    { label: "No", count: poll.no, color: "yellow" },
  ];

  return (
    <section className="results-panel" aria-labelledby="results-title">
      <div className="results-heading">
        <ChartBar size={22} weight="regular" />
        <div>
          <h2 id="results-title">Resultados preliminares públicos del prototipo</h2>
          <p>Resultados actualizados al 7 de agosto de 2026.</p>
        </div>
      </div>
      <div className="chart" role="img" aria-label="Resultados preliminares de Sí y No">
        {results.map((result) => {
          const percentage = (result.count / total) * 100;
          return (
            <div className="chart-column" key={result.label}>
              <strong>{formatPercent(result.count, total)}</strong>
              <div className="chart-track">
                <div className={`chart-bar ${result.color}`} style={{ height: `${Math.max(34, percentage * 2.1)}px` }} />
              </div>
              <span className="chart-label">{result.label}</span>
              <small>{result.count.toLocaleString("es-AR")} votos</small>
            </div>
          );
        })}
      </div>
      <div className="results-note">
        <ShieldCheck size={20} weight="regular" />
        <p>El contrato actual registra Sí y No. El conteo es preliminar, público y verificable.</p>
      </div>
    </section>
  );
}

function VotesView({ onStartVote }: { onStartVote: (pollId: string) => void }) {
  const [selectedId, setSelectedId] = useState(DEFAULT_POLL.id);
  const selectedPoll = POLLS.find((poll) => poll.id === selectedId) ?? DEFAULT_POLL;

  return (
    <main className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Participación ciudadana</p>
          <h1>Votaciones en curso</h1>
        </div>
        <span className="open-count"><span className="status-dot" />{POLLS.length} abiertas</span>
      </div>

      <article className="poll-detail">
        <div className="poll-meta">
          <StatusPill>{selectedPoll.status}</StatusPill>
          <span>{selectedPoll.starts}</span>
        </div>
        <h2>{selectedPoll.title}</h2>
        <p className="poll-description">{selectedPoll.description}</p>
        <button className="text-link" onClick={() => setSelectedId(selectedPoll.id)}>
          <Info size={18} /> Leé la propuesta completa <ArrowRight size={16} />
        </button>

        <div className="poll-stats">
          <div><Calendar size={20} /><span>Cierre de la votación<strong>{selectedPoll.deadline}</strong></span></div>
          <div><Users size={20} /><span>Personas habilitadas<strong>{selectedPoll.eligible}</strong></span></div>
        </div>

        <button className="primary-button yellow" onClick={() => onStartVote(selectedPoll.id)}>
          <Stamp size={22} weight="regular" /> Votá ahora
        </button>
      </article>

      <ResultsChart poll={selectedPoll} />

      <section className="project-section" aria-labelledby="projects-title">
        <div className="section-title-row">
          <div><p className="eyebrow">Más consultas</p><h2 id="projects-title">Conocé cada propuesta</h2></div>
          <Globe size={22} />
        </div>
        <div className="project-list">
          {POLLS.map((poll) => (
            <button key={poll.id} className={`project-row ${poll.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(poll.id)}>
              <span className="project-row-icon"><Stamp size={20} /></span>
              <span className="project-row-copy"><strong>{poll.title}</strong><small>{poll.deadline}</small></span>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function UnderstandView() {
  return (
    <main className="page-content">
      <section className="welcome-panel">
        <div className="welcome-copy">
          <p className="eyebrow">Bienvenido/a</p>
          <h1>Decidir en comunidad, con información clara.</h1>
          <p>Acá podés aprender cómo funciona un referéndum ciudadano verificable antes de elegir si querés votar.</p>
        </div>
        <img className="gaucho" src="/assets/gaucho-waving.png" alt="Ilustración de un gaucho saludando" />
      </section>

      <section className="explain-panel">
        <div className="explain-icon"><Fingerprint size={24} /></div>
        <div><h2>Tu decisión, tu comprobante</h2><p>La demo separa la información pública de la verificación necesaria para votar.</p></div>
      </section>

      <section className="faq-section" aria-labelledby="faq-title">
        <div className="section-title-row"><div><p className="eyebrow">Preguntas frecuentes</p><h2 id="faq-title">Entendé la propuesta</h2></div><Question size={24} /></div>
        <div className="faq-list">
          {FAQS.map((faq) => (
            <details key={faq.question} className="faq-item">
              <summary><span>{faq.question}</span><ArrowRight size={18} /></summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="independent-note"><Info size={16} /> Prototipo independiente para hackathon. No es un sitio oficial del Estado argentino.</p>
    </main>
  );
}

function VerifyView({ receipts }: { receipts: VoteReceipt[] }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<"found" | "missing" | null>(null);
  const matched = receipts.find((receipt) => receipt.id === query.trim());

  function verify() {
    setResult(matched ? "found" : "missing");
  }

  return (
    <main className="page-content">
      <section className="verify-hero">
        <div className="verify-icon"><ShieldCheck size={32} weight="regular" /></div>
        <p className="eyebrow">Transparencia pública</p>
        <h1>Verificá un comprobante</h1>
        <p>Buscá el identificador de tu voto para consultar si fue confirmado en la demo.</p>
      </section>

      <form className="verify-form" onSubmit={(event) => { event.preventDefault(); verify(); }}>
        <label htmlFor="receipt-id">Identificador del comprobante</label>
        <div className="search-control"><MagnifyingGlass size={20} /><input id="receipt-id" value={query} onChange={(event) => { setQuery(event.target.value); setResult(null); }} placeholder="demo-..." /><button type="submit" disabled={!query.trim()}>Buscar</button></div>
      </form>

      {result === "found" && matched ? (
        <section className="verify-result success" aria-live="polite">
          <CheckCircle size={28} weight="fill" /><div><strong>Comprobante confirmado</strong><p>Tu elección {matched.choice === "YES" ? "Sí" : "No"} quedó registrada en el modo demo.</p><code>{matched.id}</code></div>
        </section>
      ) : null}
      {result === "missing" ? <section className="verify-result missing" aria-live="polite"><Info size={24} /><div><strong>No encontramos ese comprobante</strong><p>Revisá el identificador o esperá a que la transacción termine de confirmarse.</p></div></section> : null}

      <section className="verify-explanation">
        <h2>¿Qué podés comprobar?</h2>
        <ul><li><Check size={18} /> Que el comprobante existe en esta demo.</li><li><Check size={18} /> Que la operación tiene un estado confirmado.</li><li><Check size={18} /> Que no necesitás volver a compartir tus datos personales.</li></ul>
      </section>
    </main>
  );
}

function FlowStepper({ active }: { active: number }) {
  const steps = ["Entendé", "Verificá", "Votá"];
  return <div className="flow-stepper">{steps.map((step, index) => <div className={`flow-step ${index + 1 === active ? "current" : index + 1 < active ? "done" : ""}`} key={step}><span>{index + 1 < active ? <Check size={16} weight="bold" /> : index + 1}</span><small>{step}</small></div>)}</div>;
}

function VoteFlow({ stage, choice, onChoice, onStage, onClose, onConfirm, onViewReceipt, walletStatus }: { stage: FlowStage; choice: Choice | null; onChoice: (choice: Choice) => void; onStage: (stage: FlowStage) => void; onClose: () => void; onConfirm: () => void; onViewReceipt: () => void; walletStatus: string }) {
  const activeStep = stage === "verify" || stage === "eligible" ? 2 : 3;

  return (
    <main className="page-content flow-page">
      <button className="back-button" onClick={onClose}><ArrowLeft size={18} /> Volver a la propuesta</button>
      <FlowStepper active={activeStep} />

      {stage === "verify" && <section className="flow-card"><div className="flow-card-icon"><Fingerprint size={32} /></div><p className="eyebrow">Paso 2 de 3</p><h1>Antes de votar</h1><h2>Verificá tu elegibilidad</h2><p>Para esta demo vamos a simular una validación local. No subimos ni guardamos documentos reales.</p><div className="trust-line"><ShieldCheck size={20} /><span>Una persona, un voto.</span></div><button className="primary-button yellow" onClick={() => onStage("eligible")}>Verificá tu elegibilidad <ArrowRight size={20} /></button><button className="secondary-link" onClick={() => onStage("eligible")}>Ver cómo cuidamos tu privacidad <ArrowRight size={16} /></button></section>}

      {stage === "eligible" && <section className="flow-card success-card"><div className="success-symbol"><Check size={34} weight="bold" /></div><p className="eyebrow">Verificación simulada</p><h1>Listo, podés votar</h1><p>La demo confirmó que tu credencial cumple las condiciones de esta consulta. Este paso no tomó ningún documento real.</p><div className="data-summary"><span><CheckCircle size={18} /> Elegibilidad validada</span><span><ShieldCheck size={18} /> Datos no guardados</span></div><button className="primary-button blue" onClick={() => onStage("choose")}>Continuar al voto <ArrowRight size={20} /></button></section>}

      {stage === "choose" && <section className="flow-card"><p className="eyebrow">Paso 3 de 3</p><h1>Elegí tu respuesta</h1><p>¿Querés priorizar energías renovables en tu comunidad?</p><div className="choice-list"><button className={`choice-button yes ${choice === "YES" ? "selected" : ""}`} onClick={() => onChoice("YES")}><span>Sí</span><small>Estoy de acuerdo</small><span className="choice-check">{choice === "YES" ? <Check size={18} weight="bold" /> : null}</span></button><button className={`choice-button no ${choice === "NO" ? "selected" : ""}`} onClick={() => onChoice("NO")}><span>No</span><small>No estoy de acuerdo</small><span className="choice-check">{choice === "NO" ? <Check size={18} weight="bold" /> : null}</span></button></div><button className="primary-button blue" disabled={!choice} onClick={() => onStage("review")}>Revisar mi voto <ArrowRight size={20} /></button></section>}

      {stage === "review" && <section className="flow-card"><p className="eyebrow">Revisá antes de confirmar</p><h1>Tu elección</h1><div className={`review-choice ${choice === "YES" ? "yes" : "no"}`}><span>{choice === "YES" ? "Sí" : "No"}</span><small>¿Querés priorizar energías renovables en tu comunidad?</small></div><div className="review-notice"><Info size={20} /><p>Resultados preliminares públicos del prototipo. La demo no captura tu identidad.</p></div>{APP_MODE === "preview" && walletStatus !== "connected" ? <button className="secondary-button" onClick={onClose}><Wallet size={18} /> Conectá tu wallet para usar Preview</button> : null}<button className="primary-button yellow" onClick={onConfirm}>Confirmar voto {APP_MODE === "preview" ? "en demo" : ""} <ArrowRight size={20} /></button></section>}

      {stage === "processing" && <section className="flow-card processing-card"><div className="processing-spinner"><ChartBar size={34} /></div><p className="eyebrow">Procesando</p><h1>Estamos preparando tu comprobante</h1><p>En Preview, este paso reúne la prueba, el balanceo y la confirmación. En esta demo dura solo un instante.</p><div className="processing-track"><span /></div></section>}

      {stage === "receipt" && <section className="flow-card success-card"><div className="success-symbol"><Check size={34} weight="bold" /></div><p className="eyebrow">Voto registrado</p><h1>Gracias por participar</h1><p>Tu voto quedó confirmado en el modo demo. Guardá este identificador para verificarlo.</p><div className="receipt-box"><span>Comprobante</span><strong>Disponible en Verificá</strong><small>Usá el botón de abajo para consultarlo.</small></div><button className="primary-button blue" onClick={onViewReceipt}>Ver mi comprobante <ArrowRight size={20} /></button></section>}
    </main>
  );
}

function CivicApp() {
  const [tab, setTab] = useState<Tab>("votes");
  const [flowStage, setFlowStage] = useState<FlowStage | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [receipts, setReceipts] = useState<VoteReceipt[]>(loadReceipts);
  const { status: walletStatus } = useWallet();

  const currentTabContent = useMemo(() => {
    if (tab === "understand") return <UnderstandView />;
    if (tab === "verify") return <VerifyView receipts={receipts} />;
    return <VotesView onStartVote={() => { setChoice(null); setReceipt(null); setFlowStage("verify"); }} />;
  }, [receipts, tab]);

  function navigate(nextTab: Tab) {
    setTab(nextTab);
    setFlowStage(null);
  }

  function confirmVote() {
    setFlowStage("processing");
    window.setTimeout(() => {
      const nextReceipt: VoteReceipt = { id: `demo-${Date.now().toString(36)}`, choice: choice ?? "YES", createdAt: new Date().toISOString(), status: "demo-confirmed" };
      const nextReceipts = [nextReceipt, ...receipts];
      setReceipts(nextReceipts);
      localStorage.setItem("referendum_civico_receipts", JSON.stringify(nextReceipts));
      setReceipt(nextReceipt);
      setFlowStage("receipt");
    }, 850);
  }

  return (
    <div className="app-shell">
      <Header />
      <div className="mode-strip"><span><span className="status-dot" />{APP_MODE === "preview" ? (CONTRACT_ADDRESS ? "Modo Preview · contrato configurado" : "Modo Preview · falta contrato") : "Modo demo · sin datos reales"}</span><span className="mode-help">{APP_MODE === "preview" ? "Wallet y configuración desde Lace" : "Podés explorar sin wallet"}</span></div>
      {flowStage ? <VoteFlow stage={flowStage} choice={choice} onChoice={setChoice} onStage={setFlowStage} onClose={() => setFlowStage(null)} onConfirm={confirmVote} onViewReceipt={() => { setFlowStage(null); setTab("verify"); }} walletStatus={walletStatus} /> : currentTabContent}
      <BottomNav tab={tab} onChange={navigate} />
      {receipt ? <button className="receipt-toast" onClick={() => { setFlowStage(null); setTab("verify"); }}><CheckCircle size={18} weight="fill" /> Último comprobante listo <ArrowRight size={16} /></button> : null}
    </div>
  );
}

export function App() {
  return (
    <WalletProvider>
      <MidnightProvidersProvider>
        <CivicApp />
      </MidnightProvidersProvider>
    </WalletProvider>
  );
}
