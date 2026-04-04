package com.lab.common;

import lombok.Data;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 统一分页响应
 */
@Data
public class PageResponse<T> {

    private List<T> items;
    private long total;
    private int page;
    private int pageSize;
    private int totalPages;

    public static <T> PageResponse<T> of(Page<T> springPage) {
        PageResponse<T> resp = new PageResponse<>();
        resp.setItems(springPage.getContent());
        resp.setTotal(springPage.getTotalElements());
        resp.setPage(springPage.getNumber());       // 0-based, matches current frontend
        resp.setPageSize(springPage.getSize());
        resp.setTotalPages(springPage.getTotalPages());
        return resp;
    }

    public static <T> PageResponse<T> of(List<T> items, long total, int page, int pageSize) {
        PageResponse<T> resp = new PageResponse<>();
        resp.setItems(items);
        resp.setTotal(total);
        resp.setPage(page);
        resp.setPageSize(pageSize);
        resp.setTotalPages(pageSize > 0 ? (int) Math.ceil((double) total / pageSize) : 0);
        return resp;
    }
}
