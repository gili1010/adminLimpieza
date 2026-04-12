"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  format,
  isAfter,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CartItem, Client, Product, Sale, SaleItem } from "@/lib/types";

type View = "dashboard" | "ventas" | "productos" | "clientes";
type Range = "day" | "week" | "month";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);

export default function Home() {
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [bootLoading, setBootLoading] = useState(Boolean(supabase));
  const [pageLoading, setPageLoading] = useState(false);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [range, setRange] = useState<Range>("day");
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  const [productName, setProductName] = useState("");
  const [productCost, setProductCost] = useState("");
  const [productSalePrice, setProductSalePrice] = useState("");
  const [productStock, setProductStock] = useState("");
  const [productStockMin, setProductStockMin] = useState("0");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState("1");
  const [selectedSalePrice, setSelectedSalePrice] = useState("");
  const [saleClientId, setSaleClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [historyStartDate, setHistoryStartDate] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [historyEndDate, setHistoryEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    const selectedProduct = products.find((product) => product.id === selectedProductId);
    if (!selectedProduct) {
      setSelectedSalePrice("");
      return;
    }

    const quantity = Number(selectedQuantity) || 1;
    setSelectedSalePrice(String(Number(selectedProduct.sale_price) * quantity));
  }, [products, selectedProductId, selectedQuantity]);

  const selectedUnitSalePrice = useMemo(() => {
    const quantity = Number(selectedQuantity);
    const totalSalePrice = Number(selectedSalePrice);

    if (Number.isNaN(quantity) || quantity <= 0) return null;
    if (Number.isNaN(totalSalePrice) || totalSalePrice < 0) return null;

    return totalSalePrice / quantity;
  }, [selectedQuantity, selectedSalePrice]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  );

  const saleItemsBySaleId = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    saleItems.forEach((item) => {
      const existing = map.get(item.sale_id) ?? [];
      existing.push(item);
      map.set(item.sale_id, existing);
    });
    return map;
  }, [saleItems]);

  const editingSaleBaseQuantities = useMemo(() => {
    const map = new Map<string, number>();
    if (!editingSaleId) return map;

    (saleItemsBySaleId.get(editingSaleId) ?? []).forEach((item) => {
      map.set(item.product_id, (map.get(item.product_id) ?? 0) + Number(item.quantity));
    });

    return map;
  }, [editingSaleId, saleItemsBySaleId]);

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) return;
    setPageLoading(true);
    setError(null);

    const [productsQuery, clientsQuery, salesQuery] = await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select("*")
        .eq("owner_id", userId)
        .order("name", { ascending: true }),
      supabase
        .from("sales")
        .select("*")
        .eq("owner_id", userId)
        .order("sold_at", { ascending: false })
        .limit(400),
    ]);

    if (productsQuery.error) {
      setError(productsQuery.error.message);
    } else {
      setProducts(productsQuery.data as Product[]);
    }

    if (clientsQuery.error) {
      if (clientsQuery.error.message.includes("Could not find the table 'public.clients'")) {
        setClients([]);
        setError(
          "Falta aplicar la migración de clientes en Supabase. Ejecutá el schema.sql actualizado y refrescá."
        );
      } else {
        setError(clientsQuery.error.message);
      }
    } else {
      setClients(clientsQuery.data as Client[]);
    }

    if (salesQuery.error) {
      setError(salesQuery.error.message);
    } else {
      const nextSales = salesQuery.data as Sale[];
      setSales(nextSales);

      if (nextSales.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("sale_items")
          .select("*")
          .in(
            "sale_id",
            nextSales.map((sale) => sale.id)
          )
          .order("created_at", { ascending: true });

        if (itemsError) {
          setError(itemsError.message);
        } else {
          setSaleItems(itemsData as SaleItem[]);
        }
      } else {
        setSaleItems([]);
      }
    }

    setPageLoading(false);
  }, [supabase]);

  // Effect 1: solo gestiona la sesión y el estado de boot.
  // Sin async, sin loadData — evita condiciones de carrera con Strict Mode.
  useEffect(() => {
    if (!supabase) {
      return;
    }

    const fallbackTimer = setTimeout(() => setBootLoading(false), 6000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      setSession(authSession ?? null);
      if (event === "INITIAL_SESSION") {
        clearTimeout(fallbackTimer);
        setBootLoading(false);
      }
    });

    return () => {
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Effect 2: carga o limpia datos cuando cambia el usuario autenticado.
  // Usa session.user.id como dep para no re-ejecutar en TOKEN_REFRESHED.
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (bootLoading) return;
    if (sessionUserId) {
      loadData(sessionUserId);
    } else {
      setProducts([]);
      setClients([]);
      setSales([]);
      setSaleItems([]);
      setCart([]);
    }
  }, [sessionUserId, bootLoading, loadData]);

  const signInOrRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setError(null);

    if (isRegister) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setError("Usuario creado. Si tenés confirmación por email, revisá tu inbox.");
      }
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const addProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) return;

    const cost = Number(productCost);
    const price = Number(productSalePrice);
    const stock = Number(productStock);
    const stockMin = Number(productStockMin);

    if (
      !productName.trim() ||
      Number.isNaN(cost) ||
      Number.isNaN(price) ||
      Number.isNaN(stock) ||
      Number.isNaN(stockMin)
    ) {
      setError("Completá nombre, costo, precio de venta, stock y stock mínimo válidos.");
      return;
    }

    const { error: insertError } = await supabase.from("products").insert({
      owner_id: session.user.id,
      name: productName.trim(),
      cost_price: cost,
      sale_price: price,
      stock,
      stock_min: stockMin,
      is_active: true,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setProductName("");
    setProductCost("");
    setProductSalePrice("");
    setProductStock("");
    setProductStockMin("0");
    await loadData(session.user.id);
  };

  const toggleProductActive = async (product: Product) => {
    if (!supabase || !session) return;

    const { error: updateError } = await supabase
      .from("products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id)
      .eq("owner_id", session.user.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData(session.user.id);
  };

  const quickEditProduct = async (product: Product) => {
    if (!supabase || !session) return;

    const name = window.prompt("Nombre", product.name) ?? product.name;
    const cost = Number(window.prompt("Costo", String(product.cost_price)) ?? product.cost_price);
    const sale = Number(
      window.prompt("Precio de venta", String(product.sale_price)) ?? product.sale_price
    );
    const stock = Number(window.prompt("Stock", String(product.stock)) ?? product.stock);
    const stockMin = Number(window.prompt("Stock mínimo", String(product.stock_min)) ?? product.stock_min);

    if (
      !name.trim() ||
      Number.isNaN(cost) ||
      Number.isNaN(sale) ||
      Number.isNaN(stock) ||
      Number.isNaN(stockMin)
    ) {
      setError("Edición cancelada: valores inválidos.");
      return;
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({ name: name.trim(), cost_price: cost, sale_price: sale, stock, stock_min: stockMin })
      .eq("id", product.id)
      .eq("owner_id", session.user.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData(session.user.id);
  };

  const addItemToCart = () => {
    const selectedProduct = products.find((product) => product.id === selectedProductId);
    const quantity = Number(selectedQuantity);
    const totalSalePrice = Number(selectedSalePrice);

    if (!selectedProduct) {
      setError("Elegí un producto.");
      return;
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    if (Number.isNaN(totalSalePrice) || totalSalePrice <= 0) {
      setError("Ingresá un precio total válido.");
      return;
    }

    const unitSalePrice = totalSalePrice / quantity;

    const reservedStock = cart
      .filter((item) => item.product_id === selectedProduct.id)
      .reduce((accumulator, item) => accumulator + item.quantity, 0);
    const editingStockCredit = editingSaleBaseQuantities.get(selectedProduct.id) ?? 0;
    const availableStock = Number(selectedProduct.stock) + editingStockCredit - reservedStock;

    if (quantity > availableStock) {
      setError("No hay stock suficiente para ese producto.");
      return;
    }

    setCart((previous) => {
      const existing = previous.find(
        (item) =>
          item.product_id === selectedProduct.id &&
          Number(item.unit_sale_price) === unitSalePrice &&
          Number(item.unit_cost_price) === Number(selectedProduct.cost_price)
      );

      if (existing) {
        return previous.map((item) =>
          item.id === existing.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [
        ...previous,
        {
          id: `${selectedProduct.id}-${unitSalePrice}-${Date.now()}`,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          quantity,
          unit_sale_price: unitSalePrice,
          unit_cost_price: Number(selectedProduct.cost_price),
        },
      ];
    });

    setSelectedQuantity("1");
    setSelectedProductId("");
    setError(null);
  };

  const removeCartItem = (cartItemId: string) => {
    setCart((previous) => previous.filter((item) => item.id !== cartItemId));
  };

  const resolveClientId = useCallback(async () => {
    if (!supabase || !session) return saleClientId || null;

    const trimmedName = newClientName.trim();
    if (!trimmedName) {
      return saleClientId || null;
    }

    const existingClient = clients.find(
      (client) => client.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingClient) {
      return existingClient.id;
    }

    const { data, error: clientInsertError } = await supabase
      .from("clients")
      .insert({
        owner_id: session.user.id,
        name: trimmedName,
      })
      .select("id")
      .single();

    if (clientInsertError || !data) {
      setError(clientInsertError?.message ?? "No se pudo crear el cliente.");
      return null;
    }

    return data.id;
  }, [clients, newClientName, saleClientId, session, supabase]);

  const resetSaleEditor = () => {
    setCart([]);
    setSaleNote("");
    setSelectedProductId("");
    setSelectedQuantity("1");
    setSelectedSalePrice("");
    setSaleClientId("");
    setNewClientName("");
    setEditingSaleId(null);
  };

  const startEditingSale = (sale: Sale) => {
    const items = saleItemsBySaleId.get(sale.id) ?? [];

    if (items.length === 0) {
      setError("La venta no tiene detalle para editar.");
      return;
    }

    if (
      cart.length > 0 &&
      !window.confirm("Ya hay productos en el carrito. ¿Querés reemplazarlos por la venta a editar?")
    ) {
      return;
    }

    setCart(
      items.map((item) => ({
        id: `${sale.id}-${item.id}`,
        product_id: item.product_id,
        product_name: productsById.get(item.product_id)?.name ?? "Producto",
        quantity: Number(item.quantity),
        unit_sale_price: Number(item.unit_sale_price),
        unit_cost_price: Number(item.unit_cost_price),
      }))
    );
    setSaleNote(sale.note ?? "");
    setSaleClientId(sale.client_id ?? "");
    setNewClientName("");
    setEditingSaleId(sale.id);
    setActiveView("ventas");
    setSelectedProductId("");
    setSelectedQuantity("1");
    setSelectedSalePrice("");
    setError(null);
  };

  const restoreStockAndDeleteSale = async (saleId: string) => {
    if (!supabase || !session) return false;

    const items = saleItemsBySaleId.get(saleId) ?? [];
    const productAdjustments = new Map<string, number>();

    items.forEach((item) => {
      productAdjustments.set(
        item.product_id,
        (productAdjustments.get(item.product_id) ?? 0) + Number(item.quantity)
      );
    });

    const stockUpdates = [...productAdjustments.entries()].map(([productId, quantity]) => {
      const product = productsById.get(productId);
      if (!product) return Promise.resolve({ error: null });

      return supabase
        .from("products")
        .update({ stock: Number(product.stock) + quantity })
        .eq("id", productId)
        .eq("owner_id", session.user.id);
    });

    const stockResults = await Promise.all(stockUpdates);
    const stockError = stockResults.find((result) => result.error)?.error;
    if (stockError) {
      setError(stockError.message);
      return false;
    }

    const { error: deleteError } = await supabase
      .from("sales")
      .delete()
      .eq("id", saleId)
      .eq("owner_id", session.user.id);

    if (deleteError) {
      setError(deleteError.message);
      return false;
    }

    return true;
  };

  const voidSale = async (saleId: string) => {
    if (!session || !supabase) return;

    if (!window.confirm("¿Seguro que querés anular esta venta? Se devolverá el stock.")) {
      return;
    }

    const success = await restoreStockAndDeleteSale(saleId);
    if (!success) return;

    if (editingSaleId === saleId) {
      resetSaleEditor();
    }

    await loadData(session.user.id);
  };

  const confirmSale = async () => {
    if (!supabase || !session) return;
    if (cart.length === 0) {
      setError("Agregá al menos un producto al carrito.");
      return;
    }

    const resolvedClientId = await resolveClientId();
    if (newClientName.trim() && !resolvedClientId) {
      return;
    }

    const totalAmount = cart.reduce(
      (accumulator, item) => accumulator + item.unit_sale_price * item.quantity,
      0
    );
    const totalCost = cart.reduce(
      (accumulator, item) => accumulator + item.unit_cost_price * item.quantity,
      0
    );
    const totalProfit = totalAmount - totalCost;

    const saleItemsPayload = cart.map((item) => {
      const lineTotal = item.unit_sale_price * item.quantity;
      const lineCost = item.unit_cost_price * item.quantity;
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_sale_price: item.unit_sale_price,
        unit_cost_price: item.unit_cost_price,
        line_total: lineTotal,
        line_cost: lineCost,
        line_profit: lineTotal - lineCost,
      };
    });

    if (editingSaleId) {
      const originalSale = sales.find((sale) => sale.id === editingSaleId);
      const originalItems = saleItemsBySaleId.get(editingSaleId) ?? [];

      if (!originalSale) {
        setError("No se encontró la venta original para editar.");
        return;
      }

      const { error: updateSaleError } = await supabase
        .from("sales")
        .update({
          client_id: resolvedClientId,
          note: saleNote.trim() || null,
          total_amount: totalAmount,
          total_cost: totalCost,
          total_profit: totalProfit,
        })
        .eq("id", editingSaleId)
        .eq("owner_id", session.user.id);

      if (updateSaleError) {
        setError(updateSaleError.message);
        return;
      }

      const { error: deleteItemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", editingSaleId);

      if (deleteItemsError) {
        setError(deleteItemsError.message);
        return;
      }

      const { error: insertEditedItemsError } = await supabase.from("sale_items").insert(
        saleItemsPayload.map((item) => ({ ...item, sale_id: editingSaleId }))
      );

      if (insertEditedItemsError) {
        setError(insertEditedItemsError.message);
        return;
      }

      const originalQuantities = new Map<string, number>();
      originalItems.forEach((item) => {
        originalQuantities.set(
          item.product_id,
          (originalQuantities.get(item.product_id) ?? 0) + Number(item.quantity)
        );
      });

      const newQuantities = new Map<string, number>();
      cart.forEach((item) => {
        newQuantities.set(item.product_id, (newQuantities.get(item.product_id) ?? 0) + item.quantity);
      });

      const affectedProducts = new Set([...originalQuantities.keys(), ...newQuantities.keys()]);
      const stockUpdates = [...affectedProducts].map((productId) => {
        const product = productsById.get(productId);
        if (!product) return Promise.resolve({ error: null });

        const originalQuantity = originalQuantities.get(productId) ?? 0;
        const newQuantity = newQuantities.get(productId) ?? 0;
        const newStock = Math.max(0, Number(product.stock) + originalQuantity - newQuantity);

        return supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", productId)
          .eq("owner_id", session.user.id);
      });

      const stockResults = await Promise.all(stockUpdates);
      const stockError = stockResults.find((result) => result.error)?.error;
      if (stockError) {
        setError(stockError.message);
        return;
      }

      resetSaleEditor();
      await loadData(session.user.id);
      return;
    }

    const { data: saleInserted, error: saleError } = await supabase
      .from("sales")
      .insert({
        owner_id: session.user.id,
        client_id: resolvedClientId,
        sold_at: new Date().toISOString(),
        note: saleNote.trim() || null,
        total_amount: totalAmount,
        total_cost: totalCost,
        total_profit: totalProfit,
      })
      .select("id")
      .single();

    if (saleError || !saleInserted) {
      setError(saleError?.message ?? "No se pudo guardar la venta.");
      return;
    }

    const { error: itemsError } = await supabase.from("sale_items").insert(
      saleItemsPayload.map((item) => ({ ...item, sale_id: saleInserted.id }))
    );
    if (itemsError) {
      setError(itemsError.message);
      await supabase.from("sales").delete().eq("id", saleInserted.id);
      return;
    }

    const stockUpdates = cart.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return Promise.resolve({ error: null });

      const newStock = Math.max(0, Number(product.stock) - item.quantity);
      return supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", product.id)
        .eq("owner_id", session.user.id);
    });

    const stockResults = await Promise.all(stockUpdates);
    const stockError = stockResults.find((result) => result.error)?.error;
    if (stockError) {
      setError(stockError.message);
      return;
    }

    resetSaleEditor();
    await loadData(session.user.id);
  };

  const filteredSales = useMemo(() => {
    const now = new Date();
    const periodStart =
      range === "day"
        ? startOfDay(now)
        : range === "week"
          ? startOfWeek(now, { weekStartsOn: 1 })
          : startOfMonth(now);

    return sales.filter((sale) => {
      const soldAt = parseISO(sale.sold_at);
      return isAfter(soldAt, periodStart) || soldAt.getTime() === periodStart.getTime();
    });
  }, [range, sales]);

  const totals = useMemo(() => {
    const totalAmount = filteredSales.reduce(
      (accumulator, sale) => accumulator + Number(sale.total_amount),
      0
    );
    const totalCost = filteredSales.reduce(
      (accumulator, sale) => accumulator + Number(sale.total_cost),
      0
    );
    const totalProfit = filteredSales.reduce(
      (accumulator, sale) => accumulator + Number(sale.total_profit),
      0
    );
    const ticketAverage = filteredSales.length ? totalAmount / filteredSales.length : 0;

    return {
      totalAmount,
      totalCost,
      totalProfit,
      ticketAverage,
      count: filteredSales.length,
    };
  }, [filteredSales]);

  const chartData = useMemo(() => {
    const mapByDay = new Map<string, { day: string; ingreso: number; ganancia: number }>();

    filteredSales.forEach((sale) => {
      const day = format(parseISO(sale.sold_at), "dd/MM");
      const prev = mapByDay.get(day);
      if (prev) {
        prev.ingreso += Number(sale.total_amount);
        prev.ganancia += Number(sale.total_profit);
      } else {
        mapByDay.set(day, {
          day,
          ingreso: Number(sale.total_amount),
          ganancia: Number(sale.total_profit),
        });
      }
    });

    return [...mapByDay.values()];
  }, [filteredSales]);

  const cartTotal = cart.reduce(
    (accumulator, item) => accumulator + item.unit_sale_price * item.quantity,
    0
  );

  const filteredSalesHistory = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = format(parseISO(sale.sold_at), "yyyy-MM-dd");
      if (historyStartDate && saleDate < historyStartDate) return false;
      if (historyEndDate && saleDate > historyEndDate) return false;
      return true;
    });
  }, [historyEndDate, historyStartDate, sales]);

  const filteredSaleItems = useMemo(() => {
    const filteredSaleIds = new Set(filteredSales.map((sale) => sale.id));
    return saleItems.filter((item) => filteredSaleIds.has(item.sale_id));
  }, [filteredSales, saleItems]);

  const rankingData = useMemo(() => {
    const productStats = new Map<
      string,
      {
        productId: string;
        name: string;
        quantity: number;
        revenue: number;
        cost: number;
        profit: number;
      }
    >();

    filteredSaleItems.forEach((item) => {
      const product = productsById.get(item.product_id);
      const current = productStats.get(item.product_id) ?? {
        productId: item.product_id,
        name: product?.name ?? "Producto",
        quantity: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };

      current.quantity += Number(item.quantity);
      current.revenue += Number(item.line_total);
      current.cost += Number(item.line_cost);
      current.profit += Number(item.line_profit);

      productStats.set(item.product_id, current);
    });

    const items = [...productStats.values()];

    return {
      mostSold: [...items].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      highestProfit: [...items].sort((a, b) => b.profit - a.profit).slice(0, 5),
      lowestMargin: [...items]
        .map((item) => ({
          ...item,
          unitMargin: item.quantity > 0 ? item.profit / item.quantity : 0,
        }))
        .sort((a, b) => a.unitMargin - b.unitMargin)
        .slice(0, 5),
    };
  }, [filteredSaleItems, productsById]);

  const lowStockProducts = useMemo(() => {
    return products
      .filter(
        (product) => product.is_active && Number(product.stock_min) > 0 && Number(product.stock) <= Number(product.stock_min)
      )
      .sort((a, b) => Number(a.stock) - Number(b.stock));
  }, [products]);

  const bestSalesDay = useMemo(() => {
    const dayMap = new Map<string, { label: string; total: number; profit: number; salesCount: number }>();

    filteredSales.forEach((sale) => {
      const key = format(parseISO(sale.sold_at), "yyyy-MM-dd");
      const current = dayMap.get(key) ?? {
        label: format(parseISO(sale.sold_at), "dd/MM/yyyy"),
        total: 0,
        profit: 0,
        salesCount: 0,
      };

      current.total += Number(sale.total_amount);
      current.profit += Number(sale.total_profit);
      current.salesCount += 1;

      dayMap.set(key, current);
    });

    return [...dayMap.values()].sort((a, b) => b.total - a.total)[0] ?? null;
  }, [filteredSales]);

  const clientSummary = useMemo(() => {
    const stats = new Map<
      string,
      {
        id: string;
        name: string;
        purchases: number;
        totalAmount: number;
        totalProfit: number;
        lastPurchase: string;
      }
    >();

    sales.forEach((sale) => {
      if (!sale.client_id) return;

      const client = clientsById.get(sale.client_id);
      const current = stats.get(sale.client_id) ?? {
        id: sale.client_id,
        name: client?.name ?? "Cliente",
        purchases: 0,
        totalAmount: 0,
        totalProfit: 0,
        lastPurchase: sale.sold_at,
      };

      current.purchases += 1;
      current.totalAmount += Number(sale.total_amount);
      current.totalProfit += Number(sale.total_profit);
      if (sale.sold_at > current.lastPurchase) {
        current.lastPurchase = sale.sold_at;
      }

      stats.set(sale.client_id, current);
    });

    return [...stats.values()].sort((a, b) => b.purchases - a.purchases || b.totalAmount - a.totalAmount);
  }, [clientsById, sales]);

  if (!supabase) {
    return (
      <main className="min-h-screen bg-zinc-100 p-6 text-zinc-900">
        <div className="mx-auto max-w-3xl rounded-xl border border-zinc-300 bg-white p-6">
          <h1 className="text-xl font-semibold">Configurar variables de entorno</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Creá el archivo <strong>.env.local</strong> con <strong>NEXT_PUBLIC_SUPABASE_URL</strong> y
            <strong> NEXT_PUBLIC_SUPABASE_ANON_KEY</strong>.
          </p>
        </div>
      </main>
    );
  }

  if (bootLoading) {
    return (
      <main className="min-h-screen bg-zinc-100 p-6 text-zinc-900">
        <div className="mx-auto max-w-5xl">Cargando...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-zinc-900">
        <form
          onSubmit={signInOrRegister}
          className="w-full max-w-md rounded-2xl border border-zinc-300 bg-white p-6"
        >
          <h1 className="text-2xl font-semibold">Admin de Limpieza</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Ingresá con tu cuenta para cargar ventas y ver ganancias.
          </p>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm">
              Email
              <input
                className="h-10 rounded-md border border-zinc-300 px-3"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Contraseña
              <input
                className="h-10 rounded-md border border-zinc-300 px-3"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button className="mt-5 h-10 w-full rounded-md bg-zinc-900 text-white" type="submit">
            {isRegister ? "Crear usuario" : "Ingresar"}
          </button>

          <button
            className="mt-2 h-10 w-full rounded-md border border-zinc-300"
            type="button"
            onClick={() => {
              setError(null);
              setIsRegister((prev) => !prev);
            }}
          >
            {isRegister ? "Ya tengo cuenta" : "No tengo cuenta"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-4 text-zinc-900 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-300 bg-white p-4">
          <div>
            <h1 className="text-xl font-semibold">Admin de Negocio</h1>
            <p className="text-sm text-zinc-600">{session.user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveView("dashboard")}
              className={`h-9 rounded-md px-3 text-sm ${
                activeView === "dashboard" ? "bg-zinc-900 text-white" : "border border-zinc-300"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveView("ventas")}
              className={`h-9 rounded-md px-3 text-sm ${
                activeView === "ventas" ? "bg-zinc-900 text-white" : "border border-zinc-300"
              }`}
            >
              Ventas
            </button>
            <button
              onClick={() => setActiveView("productos")}
              className={`h-9 rounded-md px-3 text-sm ${
                activeView === "productos" ? "bg-zinc-900 text-white" : "border border-zinc-300"
              }`}
            >
              Productos
            </button>
            <button
              onClick={() => setActiveView("clientes")}
              className={`h-9 rounded-md px-3 text-sm ${
                activeView === "clientes" ? "bg-zinc-900 text-white" : "border border-zinc-300"
              }`}
            >
              Clientes
            </button>
            <button onClick={signOut} className="h-9 rounded-md border border-zinc-300 px-3 text-sm">
              Salir
            </button>
          </div>
        </header>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {pageLoading && <p className="text-sm text-zinc-600">Actualizando datos...</p>}

        {activeView === "dashboard" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-700">Rango:</span>
              <button
                className={`h-8 rounded-md px-3 text-sm ${
                  range === "day" ? "bg-zinc-900 text-white" : "border border-zinc-300"
                }`}
                onClick={() => setRange("day")}
              >
                Hoy
              </button>
              <button
                className={`h-8 rounded-md px-3 text-sm ${
                  range === "week" ? "bg-zinc-900 text-white" : "border border-zinc-300"
                }`}
                onClick={() => setRange("week")}
              >
                Semana
              </button>
              <button
                className={`h-8 rounded-md px-3 text-sm ${
                  range === "month" ? "bg-zinc-900 text-white" : "border border-zinc-300"
                }`}
                onClick={() => setRange("month")}
              >
                Mes
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <p className="text-xs text-zinc-500">Ingresos</p>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(totals.totalAmount)}</p>
              </div>
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <p className="text-xs text-zinc-500">Costo</p>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(totals.totalCost)}</p>
              </div>
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <p className="text-xs text-zinc-500">Ganancia</p>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(totals.totalProfit)}</p>
              </div>
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <p className="text-xs text-zinc-500">Ventas</p>
                <p className="mt-1 text-lg font-semibold">{totals.count}</p>
              </div>
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <p className="text-xs text-zinc-500">Ticket promedio</p>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(totals.ticketAverage)}</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <h2 className="text-sm font-medium">Mejor día del período</h2>
                {bestSalesDay ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-zinc-500">Fecha</p>
                      <p className="text-sm font-medium">{bestSalesDay.label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Ventas</p>
                      <p className="text-sm font-medium">{formatCurrency(bestSalesDay.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Ganancia</p>
                      <p className="text-sm font-medium text-green-700">{formatCurrency(bestSalesDay.profit)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">Todavía no hay ventas en este período.</p>
                )}
              </div>

              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium">Alertas de stock bajo</h2>
                  <span className="text-xs text-zinc-500">Según el mínimo definido por producto</span>
                </div>
                <div className="mt-3 space-y-2">
                  {lowStockProducts.length === 0 && (
                    <p className="text-sm text-zinc-500">No hay productos con stock bajo.</p>
                  )}
                  {lowStockProducts.slice(0, 6).map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{product.name}</p>
                        <p className="text-xs text-zinc-500">
                          Mínimo {formatQuantity(Number(product.stock_min))} · sugerido {formatCurrency(Number(product.sale_price))}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          Number(product.stock) <= 0
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        Stock {formatQuantity(Number(product.stock))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-300 bg-white p-4">
              <h2 className="text-sm font-medium">Evolución del período</h2>
              <div className="mt-3 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="ingreso" fill="#27272a" name="Ingresos" />
                    <Bar dataKey="ganancia" fill="#16a34a" name="Ganancia" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-300 bg-white p-4">
              <h2 className="text-sm font-medium">Últimas ventas</h2>
              <div className="mt-3 overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left">
                      <th className="py-2">Fecha</th>
                      <th className="py-2">Importe</th>
                      <th className="py-2">Costo</th>
                      <th className="py-2">Ganancia</th>
                      <th className="py-2">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 12).map((sale) => (
                      <tr key={sale.id} className="border-b border-zinc-100">
                        <td className="py-2">{format(parseISO(sale.sold_at), "dd/MM/yyyy HH:mm")}</td>
                        <td className="py-2">{formatCurrency(Number(sale.total_amount))}</td>
                        <td className="py-2">{formatCurrency(Number(sale.total_cost))}</td>
                        <td className="py-2">{formatCurrency(Number(sale.total_profit))}</td>
                        <td className="py-2">{sale.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <h2 className="text-sm font-medium">Más vendidos</h2>
                <div className="mt-3 space-y-2">
                  {rankingData.mostSold.length === 0 && (
                    <p className="text-sm text-zinc-500">Sin datos para este período.</p>
                  )}
                  {rankingData.mostSold.map((item, index) => (
                    <div key={`${item.productId}-sold`} className="rounded-md border border-zinc-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {index + 1}. {item.name}
                        </p>
                        <span className="text-sm font-semibold">{formatQuantity(item.quantity)}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">Ingresó {formatCurrency(item.revenue)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <h2 className="text-sm font-medium">Mayor ganancia</h2>
                <div className="mt-3 space-y-2">
                  {rankingData.highestProfit.length === 0 && (
                    <p className="text-sm text-zinc-500">Sin datos para este período.</p>
                  )}
                  {rankingData.highestProfit.map((item, index) => (
                    <div key={`${item.productId}-profit`} className="rounded-md border border-zinc-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {index + 1}. {item.name}
                        </p>
                        <span className="text-sm font-semibold text-green-700">
                          {formatCurrency(item.profit)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">Cantidad vendida {formatQuantity(item.quantity)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <h2 className="text-sm font-medium">Menor margen</h2>
                <div className="mt-3 space-y-2">
                  {rankingData.lowestMargin.length === 0 && (
                    <p className="text-sm text-zinc-500">Sin datos para este período.</p>
                  )}
                  {rankingData.lowestMargin.map((item, index) => (
                    <div key={`${item.productId}-margin`} className="rounded-md border border-zinc-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {index + 1}. {item.name}
                        </p>
                        <span className="text-sm font-semibold">
                          {formatCurrency(item.unitMargin)} / litro
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">Ganancia total {formatCurrency(item.profit)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === "ventas" && (
          <section className="space-y-4">
            {editingSaleId && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Estás editando una venta existente.</p>
                    <p>Modificá los productos y luego guardá para actualizarla.</p>
                  </div>
                  <button
                    onClick={resetSaleEditor}
                    className="rounded-md border border-amber-400 px-3 py-2 text-xs"
                  >
                    Cancelar edición
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <h2 className="text-sm font-medium">{editingSaleId ? "Editar venta" : "Cargar venta del día"}</h2>

                <div className="mt-3 grid gap-3">
                  <label className="grid gap-1 text-sm">
                    Cliente cargado (opcional)
                    <select
                      value={saleClientId}
                      onChange={(event) => setSaleClientId(event.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3"
                    >
                      <option value="">Sin cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    O escribir cliente nuevo
                    <input
                      className="h-10 rounded-md border border-zinc-300 px-3"
                      value={newClientName}
                      onChange={(event) => setNewClientName(event.target.value)}
                      placeholder="Ej: Juan Pérez"
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    Producto
                    <select
                      value={selectedProductId}
                      onChange={(event) => setSelectedProductId(event.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3"
                    >
                      <option value="">Seleccionar...</option>
                      {products
                        .filter((product) => product.is_active)
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} · Stock {formatQuantity(Number(product.stock))} · sugerido x litro {formatCurrency(Number(product.sale_price))}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    Cantidad
                    <input
                      className="h-10 rounded-md border border-zinc-300 px-3"
                      type="number"
                      min={0.001}
                      step="0.001"
                      value={selectedQuantity}
                      onChange={(event) => setSelectedQuantity(event.target.value)}
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    Precio total de venta
                    <input
                      className="h-10 rounded-md border border-zinc-300 px-3"
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={selectedSalePrice}
                      onChange={(event) => setSelectedSalePrice(event.target.value)}
                      placeholder="Ej: total por los 5 litros"
                    />
                  </label>

                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                    {selectedUnitSalePrice !== null
                      ? `Precio por litro calculado: ${formatCurrency(selectedUnitSalePrice)}`
                      : "Ingresá cantidad y precio total para calcular el precio por litro."}
                  </div>

                  <button onClick={addItemToCart} className="h-10 rounded-md bg-zinc-900 text-white">
                    Agregar al carrito
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-300 bg-white p-4">
                <h2 className="text-sm font-medium">Carrito</h2>

                <div className="mt-3 space-y-2">
                  {cart.length === 0 && <p className="text-sm text-zinc-500">No hay productos agregados.</p>}

                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border border-zinc-200 p-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-zinc-500">
                          {formatQuantity(item.quantity)} litros · {formatCurrency(item.quantity * item.unit_sale_price)} total · {formatCurrency(item.unit_sale_price)} por litro · costo {formatCurrency(item.quantity * item.unit_cost_price)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeCartItem(item.id)}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>

                <label className="mt-3 grid gap-1 text-sm">
                  Nota (opcional)
                  <input
                    className="h-10 rounded-md border border-zinc-300 px-3"
                    value={saleNote}
                    onChange={(event) => setSaleNote(event.target.value)}
                    placeholder="Ej: entrega barrio centro"
                  />
                </label>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm">
                    Total: <strong>{formatCurrency(cartTotal)}</strong>
                  </p>
                  <button onClick={confirmSale} className="h-10 rounded-md bg-green-600 px-4 text-white">
                    {editingSaleId ? "Actualizar venta" : "Guardar venta"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-300 bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">Historial de ventas</h2>
                  <p className="text-xs text-zinc-500">Buscá por fecha y revisá el detalle completo de cada venta.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    Desde
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(event) => setHistoryStartDate(event.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Hasta
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(event) => setHistoryEndDate(event.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3"
                    />
                  </label>
                  <button
                    onClick={() => {
                      setHistoryStartDate("");
                      setHistoryEndDate("");
                    }}
                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  >
                    Limpiar filtros
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {filteredSalesHistory.length === 0 && (
                  <p className="text-sm text-zinc-500">No hay ventas para el rango seleccionado.</p>
                )}

                {filteredSalesHistory.map((sale) => {
                  const items = saleItemsBySaleId.get(sale.id) ?? [];

                  return (
                    <div key={sale.id} className="rounded-xl border border-zinc-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">
                            Venta del {format(parseISO(sale.sold_at), "dd/MM/yyyy HH:mm")}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Cliente: {sale.client_id ? (clientsById.get(sale.client_id)?.name ?? "Cliente") : "Sin cliente"}
                          </p>
                          <p className="text-xs text-zinc-500">{sale.note ?? "Sin nota"}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs text-zinc-500">Total</p>
                            <p className="text-sm font-medium">{formatCurrency(Number(sale.total_amount))}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Costo</p>
                            <p className="text-sm font-medium">{formatCurrency(Number(sale.total_cost))}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Ganancia</p>
                            <p className="text-sm font-medium text-green-700">{formatCurrency(Number(sale.total_profit))}</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => startEditingSale(sale)}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-xs"
                          >
                            {editingSaleId === sale.id ? "Editando" : "Editar"}
                          </button>
                          <button
                            onClick={() => voidSale(sale.id)}
                            className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-700"
                          >
                            Anular
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 overflow-auto">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead>
                            <tr className="border-b border-zinc-200 text-left">
                              <th className="py-2">Producto</th>
                              <th className="py-2">Litros</th>
                              <th className="py-2">Precio total</th>
                              <th className="py-2">Costo</th>
                              <th className="py-2">Ganancia</th>
                              <th className="py-2">Precio x litro</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id} className="border-b border-zinc-100">
                                <td className="py-2">{productsById.get(item.product_id)?.name ?? "Producto"}</td>
                                <td className="py-2">{formatQuantity(Number(item.quantity))}</td>
                                <td className="py-2">{formatCurrency(Number(item.line_total))}</td>
                                <td className="py-2">{formatCurrency(Number(item.line_cost))}</td>
                                <td className="py-2">{formatCurrency(Number(item.line_profit))}</td>
                                <td className="py-2">{formatCurrency(Number(item.unit_sale_price))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {activeView === "productos" && (
          <section className="space-y-4">
            <form onSubmit={addProduct} className="rounded-xl border border-zinc-300 bg-white p-4">
              <h2 className="text-sm font-medium">Nuevo producto</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  className="h-10 rounded-md border border-zinc-300 px-3"
                  placeholder="Nombre"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-md border border-zinc-300 px-3"
                  placeholder="Costo"
                  type="number"
                  step="0.01"
                  min={0}
                  value={productCost}
                  onChange={(event) => setProductCost(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-md border border-zinc-300 px-3"
                  placeholder="Precio venta"
                  type="number"
                  step="0.01"
                  min={0}
                  value={productSalePrice}
                  onChange={(event) => setProductSalePrice(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-md border border-zinc-300 px-3"
                  placeholder="Stock"
                  type="number"
                  step="0.001"
                  min={0}
                  value={productStock}
                  onChange={(event) => setProductStock(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-md border border-zinc-300 px-3"
                  placeholder="Stock mínimo"
                  type="number"
                  step="0.001"
                  min={0}
                  value={productStockMin}
                  onChange={(event) => setProductStockMin(event.target.value)}
                  required
                />
              </div>

              <button type="submit" className="mt-3 h-10 rounded-md bg-zinc-900 px-4 text-white">
                Guardar producto
              </button>
            </form>

            <div className="rounded-xl border border-zinc-300 bg-white p-4">
              <h2 className="text-sm font-medium">Listado</h2>
              <div className="mt-3 overflow-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left">
                      <th className="py-2">Producto</th>
                      <th className="py-2">Costo</th>
                      <th className="py-2">Precio</th>
                      <th className="py-2">Margen unitario</th>
                      <th className="py-2">Stock</th>
                      <th className="py-2">Stock mínimo</th>
                      <th className="py-2">Estado</th>
                      <th className="py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const margin = Number(product.sale_price) - Number(product.cost_price);
                      return (
                        <tr key={product.id} className="border-b border-zinc-100">
                          <td className="py-2">{product.name}</td>
                          <td className="py-2">{formatCurrency(Number(product.cost_price))}</td>
                          <td className="py-2">{formatCurrency(Number(product.sale_price))}</td>
                          <td className="py-2">{formatCurrency(margin)}</td>
                          <td className="py-2">{formatQuantity(Number(product.stock))}</td>
                          <td className="py-2">{formatQuantity(Number(product.stock_min))}</td>
                          <td className="py-2">{product.is_active ? "Activo" : "Inactivo"}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => quickEditProduct(product)}
                                className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => toggleProductActive(product)}
                                className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                              >
                                {product.is_active ? "Desactivar" : "Activar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeView === "clientes" && (
          <section className="space-y-4">
            <div className="rounded-xl border border-zinc-300 bg-white p-4">
              <h2 className="text-sm font-medium">Clientes cargados en ventas</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Solo aparecen los clientes que alguna vez fueron asociados a una venta.
              </p>

              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left">
                      <th className="py-2">Cliente</th>
                      <th className="py-2">Compras</th>
                      <th className="py-2">Total comprado</th>
                      <th className="py-2">Ganancia generada</th>
                      <th className="py-2">Última compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientSummary.length === 0 && (
                      <tr>
                        <td className="py-4 text-zinc-500" colSpan={5}>
                          Todavía no hay clientes asociados a ventas.
                        </td>
                      </tr>
                    )}
                    {clientSummary.map((client) => (
                      <tr key={client.id} className="border-b border-zinc-100">
                        <td className="py-2">{client.name}</td>
                        <td className="py-2">{client.purchases}</td>
                        <td className="py-2">{formatCurrency(client.totalAmount)}</td>
                        <td className="py-2">{formatCurrency(client.totalProfit)}</td>
                        <td className="py-2">{format(parseISO(client.lastPurchase), "dd/MM/yyyy HH:mm")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
