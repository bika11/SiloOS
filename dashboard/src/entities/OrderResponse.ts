export interface OrderResponse {
    status: number;  // SFWU_COFFEE_HTTP_STATUS (byte 0)
    orderId: number; // Int32 Big-Endian (bytes 1-4)
}
