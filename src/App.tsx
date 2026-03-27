import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");

  async function handleGreet() {
    try {
      const result = await invoke("greet", { name });
      setGreeting(result as string);
    } catch (error) {
      console.error("Erro:", error);
    }
  }

  return (
    <div className="App">
      <h1>👋 Hello World</h1>
      
      <div style={{ padding: "20px", textAlign: "center" }}>
        <input
          type="text"
          placeholder="Digite seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGreet()}
          style={{ padding: "8px", marginRight: "10px" }}
        />
        <button 
          onClick={handleGreet}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          Saudar
        </button>
      </div>

      {greeting && (
        <div style={{ marginTop: "20px", fontSize: "18px", fontWeight: "bold" }}>
          {greeting}
        </div>
      )}
    </div>
  );
}

export default App;
