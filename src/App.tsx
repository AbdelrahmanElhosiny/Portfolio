import styled from "@emotion/styled";
import "./App.css";
import Background from "./components/Background";
import CenterText from "./components/CenterText";
import Navbar from "./components/Navbar";
import MarqueeTrack from "./components/MarqueeTrack";
import { useRef } from "react";

function App() {
  const aboutRef = useRef(null);
  const skillsRef = useRef(null);
  const contactRef = useRef(null);

  return (
    <Holder>
      <Background />
      <Navbar
        aboutRef={aboutRef}
        skillsRef={skillsRef}
        contactRef={contactRef}
      />
      <div id="about" className="section" ref={aboutRef}>
        <CenterText />
        <MarqueeTrack />
      </div>
      <div id="skills" className="section" ref={skillsRef}>
        <h1>hello</h1>
      </div>
      <div id="contact" className="section" ref={contactRef}>
        <h1>hello</h1>
      </div>
    </Holder>
  );
}

const Holder = styled.div`
  position: relative;

  .section {
    height: 100vh;
    height: 100dvh;
  }
`;

export default App;
