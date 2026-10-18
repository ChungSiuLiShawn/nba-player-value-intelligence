import { useState, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation, Link } from "react-router";
import Home from "@/pages/Home";
import Stats from "@/pages/Stats";
import Rankings from "@/pages/Rankings";
import PlayerDetail from "@/pages/PlayerDetail";
import Admin from "@/pages/Admin";

const NAV = [
  { path: "/", label: "Home" },
  { path: "/stats", label: "Stats" },
  { path: "/rankings", label: "Rankings" },
  { path: "/admin", label: "Pipeline" },
];

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");

  const openPlayer = useCallback(
    (id: string) => {
      navigate(`/player/${id}`);
      setQ("");
    },
    [navigate],
  );

  const active = (p: string) =>
    p === "/" ? location.pathname === "/" : location.pathname.startsWith(p);

  return (
    <div className="min-h-screen bg-[#f6f2e9] font-sans text-stone-800">
      {/* brick-red top bar */}
      <header className="sticky top-0 z-40 bg-[#bf5546] shadow-md">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-5 px-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-sm font-black tracking-wide text-white">
              NBA Value Intel
            </span>
            <span className="hidden text-[10px] font-medium text-white/70 sm:inline">
              169 players tracked
            </span>
          </Link>
          <nav className="flex h-full items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.path}
                to={n.path}
                className={`flex h-full items-center border-b-2 px-3 text-xs font-bold transition ${
                  active(n.path)
                    ? "border-white text-white"
                    : "border-transparent text-white/75 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-14 pt-5">
        <Routes>
          <Route path="/" element={<Home q={q} setQ={setQ} openPlayer={openPlayer} />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/rankings" element={<Rankings openPlayer={openPlayer} />} />
          <Route path="/player/:id" element={<PlayerDetail />} />
          <Route path="/admin" element={<Admin />} />
          <Route
            path="*"
            element={
              <div className="py-20 text-center text-sm text-stone-500">Page not found</div>
            }
          />
        </Routes>
      </main>

      <footer className="border-t border-stone-300/60 py-5 text-center text-[10px] text-stone-500">
        NBA Player Value Intelligence — value index is for research reference only and does not
        constitute investment advice. · Prototype v3.0
      </footer>
    </div>
  );
}

export default function App() {
  return <Shell />;
}
