import styled from "@emotion/styled";
import "./App.css";
import Background from "./components/Background";
import CenterText from "./components/CenterText";

function App() {
  return (
    <Holder>
      <Background />
      <CenterText />
    </Holder>
  );
}

const Holder = styled.div``;

export default App;
