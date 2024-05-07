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
      <div className="section">
        <CenterText />
        <MarqueeTrack />
      </div>
      <div className="section">
        <h1>hello</h1>
      </div>
    </Holder>
  );
}

const Holder = styled.div`
  position: relative;

  .section {
    height: 100vh;
    scroll-snap-align: start;
  }
`;

export default App;
