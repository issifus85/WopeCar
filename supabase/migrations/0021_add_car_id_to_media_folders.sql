alter table media_folders add column car_id uuid references cars(id);
create index media_folders_car_id_idx on media_folders(car_id);
