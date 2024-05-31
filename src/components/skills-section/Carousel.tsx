import styled from "@emotion/styled";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

const Carousel = () => {
  return (
    <Holder>
      <Swiper spaceBetween={1} slidesPerView={1}>
        <SwiperSlide>Slide 1</SwiperSlide>
        <SwiperSlide>Slide 2</SwiperSlide>
        <SwiperSlide>Slide 2</SwiperSlide>
        <SwiperSlide>Slide 2</SwiperSlide>
        <SwiperSlide>Slide 2</SwiperSlide>
      </Swiper>
    </Holder>
  );
};

const Holder = styled.div`
  width: 400px;
  height: 500px;
  background-color: red;
`;

export default Carousel;
