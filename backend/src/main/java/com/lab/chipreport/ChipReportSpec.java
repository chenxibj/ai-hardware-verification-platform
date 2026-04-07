package com.lab.chipreport;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 芯片报告动态查询 Specification
 * 替代原先的 @Query findFiltered — 解决 PostgreSQL 无法推断 nullable 参数类型的问题
 */
public class ChipReportSpec {

    public static Specification<ChipReport> filtered(
            Long chipId,
            ChipReport.ReportStatus status,
            Boolean archived,
            Instant startTime,
            Instant endTime) {

        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // 排除软删除
            predicates.add(cb.equal(root.get("deleted"), false));

            if (chipId != null) {
                predicates.add(cb.equal(root.get("chipId"), chipId));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (archived != null) {
                predicates.add(cb.equal(root.get("archived"), archived));
            }
            if (startTime != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), startTime));
            }
            if (endTime != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), endTime));
            }

            // 默认按创建时间倒序
            query.orderBy(cb.desc(root.get("createdAt")));

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
