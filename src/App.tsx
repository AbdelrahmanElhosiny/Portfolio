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
      <CenterText />
      <MarqueeTrack />
    </Holder>
  );
}

const Holder = styled.div`
  position: relative;
  scroll-snap-type: y mandatory;
`;

export default App;
