-- Optional position details on watchlist items: number of shares held and total amount invested
-- (in the asset's currency). Both optional; used by the portfolio view in "Suivi".
alter table watchlist_items add column if not exists quantity numeric check (quantity is null or quantity > 0);
alter table watchlist_items add column if not exists cost_amount numeric check (cost_amount is null or cost_amount >= 0);
