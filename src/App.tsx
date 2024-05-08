import styled from "@emotion/styled";
import "./App.css";
import Background from "./components/Background";
import CenterText from "./components/CenterText";
import Navbar from "./components/Navbar";
import MarqueeTrack from "./components/MarqueeTrack";

function App() {
  return (
    <Holder>
      <Background />
      <Navbar />
      <div id="about" className="section">
        <CenterText />
        <MarqueeTrack />
      </div>
      <div id="skills" className="section">
        <h1>hello</h1>
      </div>
      <div id="contact" className="section">
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
    scroll-snap-align: start;
    scroll-behavior: smooth;
  }
`;

export default App;
