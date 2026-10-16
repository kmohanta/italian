/**
 * Icons from Lucide (ISC licence), bundled at build time — only the icons
 * imported here end up in the build. See THIRD_PARTY_NOTICES.md.
 */
import {
  createElement,
  House,
  Route,
  BookOpen,
  Languages,
  BookText,
  Music,
  Repeat,
  ChartColumn,
  Settings,
  Library,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  Volume2,
  Square,
  Star,
  Check,
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  Download,
  Upload,
  Trash2,
  Play,
  Pause,
  Eye,
  EyeOff,
  Info,
  TriangleAlert,
  RotateCcw,
  Bookmark,
  Pencil,
  Type,
  Clock,
  GraduationCap,
  Microscope,
  Shuffle,
  ListChecks,
  SquareCheck,
  ExternalLink,
  Rewind,
  Lightbulb
} from 'lucide';

const ICONS = {
  House,
  Route,
  BookOpen,
  Languages,
  BookText,
  Music,
  Repeat,
  ChartColumn,
  Settings,
  Library,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  Volume2,
  Square,
  Star,
  Check,
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  Download,
  Upload,
  Trash2,
  Play,
  Pause,
  Eye,
  EyeOff,
  Info,
  TriangleAlert,
  RotateCcw,
  Bookmark,
  Pencil,
  Type,
  Clock,
  GraduationCap,
  Microscope,
  Shuffle,
  ListChecks,
  SquareCheck,
  ExternalLink,
  Rewind,
  Lightbulb
};

/** An SVG icon element. Decorative by default (aria-hidden). */
export function icon(name, { size = 18, label } = {}) {
  const def = ICONS[name];
  if (!def) throw new Error(`Unknown icon: ${name}`);
  const svg = createElement(def);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'icon');
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  return svg;
}
