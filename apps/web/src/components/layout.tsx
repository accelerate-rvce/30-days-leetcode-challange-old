import { Link, useNavigate } from "react-router-dom";
import { Hexagon, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { NavLink, Button } from "./ui";

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const isAdmin = user && (user.role === "ADMIN" || user.role === "SUPERADMIN");
  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-line sticky top-0 z-40 bg-ink/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-disp font-bold">
            <Hexagon className="w-5 h-5 text-cy" />
            <span className="font-bold tracking-wide">ACCELERATE</span>
            <span className="hidden sm:inline text-[10px] font-mono text-mut tracking-widest">INNOVATE · CONNECT · INSPIRE</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 ml-4">
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            <NavLink to="/challenges">Challenges</NavLink>
            {user && <NavLink to="/dashboard">Dashboard</NavLink>}
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="ml-auto hidden md:flex items-center gap-3">
            {user ? (<>
              <span className="text-xs text-mut font-mono">{user.displayName}</span>
              <Button variant="ghost" onClick={async () => { await logout(); nav("/"); }}>Sign out</Button>
            </>) : (<>
              <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
              <Button asChild><Link to="/waitlist">Join the Waitlist</Link></Button>
            </>)}
          </div>
          <button className="md:hidden ml-auto p-2" aria-label="Menu" onClick={() => setOpen(!open)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
        {open && (
          <div className="md:hidden border-t border-line px-4 py-3 space-y-3">
            <div className="flex flex-col gap-3"><NavLink to="/leaderboard">Leaderboard</NavLink><NavLink to="/challenges">Challenges</NavLink>
              {user && <NavLink to="/dashboard">Dashboard</NavLink>}{isAdmin && <NavLink to="/admin">Admin</NavLink>}</div>
            <div className="flex gap-2">{user ? <Button variant="ghost" onClick={async () => { await logout(); nav("/"); }}>Sign out</Button> : (<><Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button><Button asChild><Link to="/waitlist">Join the Waitlist</Link></Button></>)}</div>
          </div>
        )}
      </header>
      <main>{children}</main>
      <footer className="border-t border-line mt-16">
        <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 md:grid-cols-3 text-sm">
          <div>
            <div className="flex items-center gap-2 font-disp font-bold"><Hexagon className="w-4 h-4 text-cy" /> ACCELERATE</div>
            <p className="text-mut mt-2">The Computer Science Club of RVCE.<br />INNOVATE · CONNECT · INSPIRE</p>
          </div>
          <div>
            <p className="font-semibold mb-2">Event</p>
            <div className="flex flex-col gap-1.5 text-mut"><Link to="/leaderboard" className="hover:text-white">Leaderboard</Link><Link to="/challenges" className="hover:text-white">Challenges</Link><Link to="/waitlist" className="hover:text-white">Waitlist</Link></div>
          </div>
          <div>
            <p className="font-semibold mb-2">Organizers</p>
            <p className="text-mut">Contact your Accelerate coordinators on campus for support, verification reviews, and invitations.</p>
          </div>
        </div>
        <div className="border-t border-line py-4 text-center text-xs text-mut font-mono">© 2026 Accelerate · RVCE · Built for learning</div>
      </footer>
    </div>
  );
}
