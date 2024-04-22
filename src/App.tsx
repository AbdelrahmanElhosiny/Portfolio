import styled from "@emotion/styled";
import "./App.css";
import SVG from "./assets/SVG";

function App() {
  return (
    <Holder>
      <div className="star">
        <SVG.BackgroundItems.star />
      </div>
    </Holder>
  );
}

const Holder = styled.div`
  .star svg {
    position: absolute;
    top: 10em;
    right: 10em;
    width: 24em;
  }
`;

export default App;
