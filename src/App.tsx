import styled from "@emotion/styled";
import "./App.css";
import Background from "./components/Background";
import CenterText from "./components/CenterText";
import Navbar from "./components/Navbar";

function App() {
  return (
    <Holder>
      <Background />
      <Navbar />
      <CenterText />
    </Holder>
  );
}

const Holder = styled.div`
  position: relative;
`;

export default App;
