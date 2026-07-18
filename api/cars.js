import { CARS } from '../data/cars';

const NETWORK_DELAY = 800;

export function fetchCars() {
  return new Promise(resolve => {
    setTimeout(() => resolve(CARS), NETWORK_DELAY);
  });
}

export function fetchCarById(id) {
  return new Promise(resolve => {
    setTimeout(() => resolve(CARS.find(car => car.id === id) ?? null), NETWORK_DELAY);
  });
}
