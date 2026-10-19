import {
  ArrowDownUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Cpu,
  Database,
  Download,
  Info,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  SlidersHorizontal,
  Sun,
  Target,
  TriangleAlert,
  Upload,
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

/** Íconos de Lucide (trazo 2 px, 24×24). Decorativos salvo que se pase `titulo`. */
type PropsIcono = LucideProps & { titulo?: string };

const TAMANO = '1.25em';

function crear(Componente: LucideIcon) {
  function IconoLucide({ titulo, ...props }: PropsIcono) {
    return (
      <Componente
        width={TAMANO}
        height={TAMANO}
        aria-hidden={titulo ? undefined : true}
        aria-label={titulo}
        role={titulo ? 'img' : undefined}
        focusable="false"
        {...props}
      />
    );
  }
  return IconoLucide;
}

export const IconoMapa = crear(Map);
export const IconoGrafica = crear(BarChart3);
export const IconoObjetivo = crear(Target);
export const IconoChip = crear(Cpu);
export const IconoPanel = crear(LayoutDashboard);
export const IconoBaseDatos = crear(Database);
export const IconoAjustes = crear(SlidersHorizontal);
export const IconoUsuarios = crear(Users);
export const IconoSalir = crear(LogOut);
export const IconoMenu = crear(Menu);
export const IconoCerrar = crear(X);
export const IconoDescarga = crear(Download);
export const IconoSubir = crear(Upload);
export const IconoAlerta = crear(TriangleAlert);
export const IconoInfo = crear(Info);
export const IconoCheck = crear(Check);
export const IconoRecargar = crear(RotateCw);
export const IconoCentroide = crear(CircleAlert);
export const IconoSol = crear(Sun);
export const IconoLuna = crear(Moon);
export const IconoCalendario = crear(CalendarDays);

const IconoContraerAbierto = crear(PanelLeftClose);
const IconoContraerCerrado = crear(PanelLeftOpen);

export const IconoContraer = ({ abierto, ...p }: PropsIcono & { abierto: boolean }) =>
  abierto ? <IconoContraerAbierto {...p} /> : <IconoContraerCerrado {...p} />;

const IconoAscendente = crear(ChevronUp);
const IconoDescendente = crear(ChevronDown);
const IconoSinOrden = crear(ArrowDownUp);

export const IconoOrden = ({ direccion, ...p }: PropsIcono & { direccion: 'asc' | 'desc' | null }) =>
  direccion === 'asc' ? (
    <IconoAscendente {...p} />
  ) : direccion === 'desc' ? (
    <IconoDescendente {...p} />
  ) : (
    <IconoSinOrden {...p} className={`opacity-40 ${p.className ?? ''}`} />
  );
