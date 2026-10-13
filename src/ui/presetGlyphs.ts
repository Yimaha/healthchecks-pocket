// The Lucide glyph for each preset in src/core/icons.ts (Lucide: ISC licence,
// see misc.md). Kept apart from the preset data so core stays React-free.

import {
  Archive, BadgeCheck, Battery, Bell, Book, Box, Bug, Calendar, Camera, Car, Clock, Cloud, CloudUpload, Code, Coffee,
  Container, Cpu, CreditCard, Database, Download, Droplet, FileText, Flag, Folder, Gamepad2, GitBranch, Globe, HardDrive,
  HeartPulse, House, Key, Leaf, Link, Lock, Mail, MemoryStick, Moon, Music, Network, Plug, Printer, RefreshCw, Rocket,
  Router, Server, Shield, ShoppingCart, Smartphone, Star, Sun, Terminal, Thermometer, Timer, Tv, Upload, Users, Wifi, Zap,
  type LucideIcon,
} from 'lucide-react';

export const GLYPHS: Record<string, LucideIcon> = {
  server: Server, database: Database, 'hard-drive': HardDrive, archive: Archive, cloud: Cloud, 'cloud-upload': CloudUpload,
  globe: Globe, network: Network, router: Router, wifi: Wifi, shield: Shield, 'badge-check': BadgeCheck, lock: Lock,
  key: Key, mail: Mail, bell: Bell, clock: Clock, calendar: Calendar, timer: Timer, cpu: Cpu, 'memory-stick': MemoryStick,
  thermometer: Thermometer, plug: Plug, battery: Battery, sun: Sun, house: House, container: Container, box: Box,
  'git-branch': GitBranch, code: Code, terminal: Terminal, bug: Bug, rocket: Rocket, 'refresh-cw': RefreshCw,
  download: Download, upload: Upload, 'file-text': FileText, folder: Folder, link: Link, smartphone: Smartphone,
  printer: Printer, tv: Tv, camera: Camera, music: Music, 'gamepad-2': Gamepad2, car: Car, leaf: Leaf, droplet: Droplet,
  'heart-pulse': HeartPulse, users: Users, 'shopping-cart': ShoppingCart, 'credit-card': CreditCard, coffee: Coffee,
  book: Book, flag: Flag, star: Star, zap: Zap, moon: Moon,
};
